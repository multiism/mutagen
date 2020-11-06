function parse_for_edit_points_even_in_comments(code) {
	var doc = [];

	// the first group here is in lieu of negative lookbehinds in javascript,
	// to avoid starting matching from inside an identifier
	// (the last group `(?!e)` is because we don't handle exponents currently)
	var numbers_regexp = /([^a-z0-9$_]|^)(0x[\dA-F]+|\d+(?:\.\d*)?|\.\d+)(?!e)/gi;
	var match;
	var last_match_lastIndex = 0;
	while ((match = numbers_regexp.exec(code)) !== null) {
		var [match_str, negative_match_group_str, num_str] = match;
		doc.push(code.slice(last_match_lastIndex, match.index + negative_match_group_str.length));
		if (isNaN(num_str)) {
			console.warn(`somehow matched ${num_str} (full match_str = ${match_str})`);
			doc.push(edit);
		} else {
			var edit_point = {
				type: "number_literal",
				text: num_str,
			};
			doc.push(edit_point);
		}
		last_match_lastIndex = numbers_regexp.lastIndex;
	}
	doc.push(code.slice(last_match_lastIndex));

	return doc;
}
function parse_for_edit_points(code) {
	// TODO: loosely ignore block comments too
	// (ignoring the complexity of things in strings, like `"// /* /*/"`, or `var rgx = /http:\/\/foo\/*/i`)

	var doc = [];

	code.split("\n").forEach((line)=> {
		if (line.match(/^\s*\/\//)) {
			doc.push(line);
		} else {
			doc = doc.concat(parse_for_edit_points_even_in_comments(line));
		}
		doc.push("\n");
	});

	doc = doc.reduce((doc, part)=> {
		var last_part = doc[doc.length - 1];
		if (typeof part === "string" && typeof last_part === "string") {
			doc[doc.length - 1] = last_part + part;
			return doc;
		}
		doc.push(part);
		return doc;
	}, []);

	return doc;
}
function document_structures_are_equivalent(doc_a, doc_b) {
	if (doc_a.length !== doc_b.length) {
		return false;
	}
	for (var i=0; i<doc_a.length; i++) {
		var part_a = doc_a[i];
		var part_b = doc_b[i];
		if (typeof part === "string") {
			if (i === 0) {
				if (remove_attribution_header(part_a) !== remove_attribution_header(part_b)) {
					return false;
				}
			} else if (part_a !== part_b) {
				return false;
			}
		}
	}
	return true;
}

function mutate_number_literal(num_str, mutation_chance) {
	var n = parseFloat(num_str);
	var original_n = n;

	// keep number as float or int (determined by whether there's a decimal point in GLSL)
	var had_dot = num_str.indexOf(".") > -1;
	var keep_as_int_or_float = (n)=> {
		if (had_dot && `${n}`.indexOf(".") === -1) {
			return `${n}.0`;
		} else if (!had_dot) {
			return `${Math.ceil(n)}`;
		}
		return `${n}`;
	};

	if (Math.random() < mutation_chance) { n += 1; }
	if (Math.random() < mutation_chance) { n -= 1; }
	if (Math.random() < mutation_chance) { n /= 2; }
	if (Math.random() < mutation_chance) { n *= 2; }
	if (!isFinite(n)) {
		console.warn(`somehow got ${n} from ${JSON.stringify(num_str)}`);
		return num_str;
	} else if (n < 0 && original_n >= 0) {
		return `(${keep_as_int_or_float(n)})`;
	}
	return keep_as_int_or_float(n);
}

function render_doc_to_string(doc, edits) {
	return doc.map((part, index)=> {
		if (typeof part === "string") {
			return part;
		} else {
			var edit = edits.find((edit)=> index === edit.index_in_doc);
			if (edit) {
				return edit.text;
			} else {
				return part.text;
			}
		}
	}).join("");
}

function get_code_from_page() {
	var cm_el = document.querySelector('.CodeMirror');
	if (cm_el) {
		var cm = cm_el.CodeMirror;
		return cm.getValue();
	}
	var textarea = document.querySelector("textarea#code, textarea"); // bytebeat, and potentially weird random things on the web
	if (textarea) {	
		return textarea.value;
	}
	alert("No code text editor found on the page");
	return "";
}
var confirmed_erase_undo_history = false;
function set_code_on_page(new_code) {
	var cm_el = document.querySelector('.CodeMirror');
	if (cm_el) {
		var cm = cm_el.CodeMirror;
		cm.setValue(new_code);
		return;
	}
	var textarea = document.querySelector("textarea#code, textarea"); // bytebeat, and potentially weird random things on the web
	if (textarea) {	
		if (confirmed_erase_undo_history || confirm("This will erase undo/redo history for the textarea, continue?")) {
			confirmed_erase_undo_history = true;
			textarea.value = new_code;
		}
		return;
	}
	// TODO for bytebeat: would seem to need to be async (for undo history to be kept intact)
	// textarea.focus();
	// setTimeout(function(){
	// 	textarea.select();
	// 	document.execCommand("InsertText", false, new_code);
	// });
}

function find_problem_in_output_on_page() {
	// shadertoy
	var error_message_el = document.querySelector(".CodeMirror-linewidget .errorMessage");
	if (error_message_el && getComputedStyle(error_message_el).visibility !== "hidden") {
		return new Error(`compile failed: ${error_message_el.textContent}`);
	}
	// shadertoy
	if (document.querySelector(".tab.errorYes")) {
		return new Error("compile failed (in some tab)");
	}
	// bytebeat - it's not very semantic in the DOM!
	var error_message_el = document.querySelector("#controls button[style^='color: rgb(255, 0, 0)']")
	if (error_message_el) {
		return new Error(`compile failed: ${error_message_el.textContent}`);
	}
	// TODO: maybe testing the canvas for whether it's blank (after rendering a frame) is be expensive enough
	// that it should first do a pass just checking that it compiles, and check *at the end* if it's blank,
	// and if it's blank then start over but checking also for blankness every time
	if (!is_output_canvas_interesting()) {
		return new Error("output looks boring / blank");
	}
}

var output_canvas = document.querySelector("canvas#demogl, canvas.playerCanvas, #player canvas, #content canvas, canvas");

var test_canvas = document.createElement("canvas");
var test_ctx = test_canvas.getContext("2d");
test_canvas.width = 10;
test_canvas.height = 10;

var thumbnail_canvas = document.createElement("canvas");
var thumbnail_ctx = thumbnail_canvas.getContext("2d");
thumbnail_canvas.width = 200;
if (output_canvas) {
	thumbnail_canvas.height = thumbnail_canvas.width * output_canvas.height / output_canvas.width;
} else {
	thumbnail_canvas.height = thumbnail_canvas.width;
}

var existing_style = document.querySelector("#mutagen-style");
if (existing_style) {
	existing_style.remove();
}
var num_breeding_slots = 4;
var css = `
#mutagen-ui-container {
	font-size: 15px;
	position: fixed;
	right: 0;
	bottom: 0;
	width: 100%;
	height: 50%;
	z-index: 10;
	display: flex;
	flex-direction: column;
	background: rgba(0, 0, 0, 0.5);
	color: white;
	/* transform: scale(0.2); */
	transform-origin: bottom right;
	transition: transform .2s ease;
	--thumbnail-width: ${thumbnail_canvas.width}px;
	--thumbnail-height: ${thumbnail_canvas.height}px;
}
/*#mutagen-ui-container:hover,
#mutagen-ui-container:focus-within {
	transform: scale(1);
}*/
#mutagen-toolbar {
	display: flex;
	height: 50px;
	align-items: center;
}
#mutagen-toolbar button {
	height: 30px;
	margin-left: 15px;
}
.mutagen-thumbnails-list {
	display: grid;
	overflow: auto;
	grid-template-columns: repeat(auto-fill, var(--thumbnail-width));
	grid-gap: 10px;
	justify-content: center;
	align-content: flex-start;
	padding-top: 15px;
	padding-bottom: 15px; /* doesn't seem to work - could use margin instead tho if there's an outer container */
}
#mutagen-breeding-box {
	grid-template-columns: repeat(4, var(--thumbnail-width));
}
#mutagen-breeding-bar {
	display: flex;
}
#mutagen-breeding-actions {
	display: flex;
	flex-direction: column;
	justify-content: center;
}
#mutagen-breeding-actions button {
	width: 100px;
	height: 50px;
	margin-right: 15px;
}
#mutagen-breeding-box {
	flex: 1;
}
.mutagen-breeding-slot,
.mutagen-thumbnail {
	width: var(--thumbnail-width);
	height: var(--thumbnail-height);
}
.mutagen-breeding-slot {
	border: 4px dashed gray;
	border-radius: 15px;
	background: rgba(50, 50, 50, 0.9);
	display: flex;
	align-items: center;
	justify-content: center;
	position: relative;
	overflow: hidden;
}
@media (max-width: 1050px) {
	#mutagen-ui-container {
		--thumbnail-width: ${thumbnail_canvas.width * 0.8}px;
		--thumbnail-height: ${thumbnail_canvas.height * 0.8}px;
	}
}
@media (max-width: 850px) {
	#mutagen-ui-container {
		--thumbnail-width: ${thumbnail_canvas.width * 0.7}px;
		--thumbnail-height: ${thumbnail_canvas.height * 0.7}px;
	}
}
@media (max-width: 750px) {
	#mutagen-ui-container {
		--thumbnail-width: ${thumbnail_canvas.width * 0.6}px;
		--thumbnail-height: ${thumbnail_canvas.height * 0.6}px;
	}
}
@media (max-width: 650px) {
	/*#mutagen-ui-container {
		--thumbnail-width: ${thumbnail_canvas.width * 0.5}px;
		--thumbnail-height: ${thumbnail_canvas.height * 0.5}px;
	}*/
	#mutagen-breeding-box {
		grid-template-columns: repeat(2, var(--thumbnail-width));
	}
}
.mutagen-breeding-slot::before {
	/* https://thenounproject.com/term/dna/12357/ */
	content: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 0 48 125"><path d="M35.838 27.603a31.956 31.956 0 003.902-3.329c4.739-4.771 7.246-10.467 7.246-16.471V4.271a4.27 4.27 0 10-8.541 0v.854H8.553v-.854a4.27 4.27 0 10-8.541 0v3.532c0 6.004 2.505 11.7 7.246 16.471 3.991 4.017 9.347 7.12 15.082 8.738 4.279 1.208 8.414 3.59 11.342 6.538 1.741 1.753 3.751 4.407 4.48 7.799H8.837c.357-1.66 1.021-3.143 1.808-4.431h23.13a17.255 17.255 0 00-1.608-1.864c-1.289-1.297-2.837-2.476-4.536-3.474H15.56a26.82 26.82 0 014.802-2.94 37.92 37.92 0 01-9.2-4.44 31.956 31.956 0 00-3.902 3.329C2.517 38.3.012 43.996.012 50c0 6.005 2.505 11.701 7.246 16.473 3.991 4.016 9.347 7.119 15.082 8.737 4.279 1.206 8.414 3.59 11.342 6.537 1.74 1.752 3.747 4.403 4.479 7.791H8.839c.358-1.66 1.022-3.144 1.812-4.43H33.77a16.913 16.913 0 00-1.604-1.856c-1.292-1.302-2.846-2.483-4.551-3.482H15.57a26.888 26.888 0 014.79-2.931 37.993 37.993 0 01-9.2-4.44 31.956 31.956 0 00-3.902 3.329C2.517 80.499.012 86.194.012 92.198v3.532a4.27 4.27 0 108.541 0v-.855h29.894v.855a4.27 4.27 0 008.542 0v-3.532c0-6.004-2.506-11.699-7.246-16.471-3.991-4.017-9.348-7.12-15.081-8.738-4.28-1.207-8.414-3.59-11.342-6.537-1.742-1.753-3.751-4.408-4.48-7.8h29.323c-.356 1.66-1.021 3.144-1.81 4.431H13.224a17.255 17.255 0 001.608 1.864c1.289 1.298 2.838 2.477 4.536 3.474h12.07a26.873 26.873 0 01-4.802 2.939 37.975 37.975 0 019.2 4.44 32.113 32.113 0 003.902-3.328c4.739-4.771 7.246-10.468 7.246-16.473 0-6.004-2.507-11.7-7.246-16.472-3.991-4.016-9.348-7.12-15.081-8.737-4.28-1.207-8.414-3.59-11.342-6.537-1.741-1.752-3.748-4.404-4.479-7.791h29.321c-.357 1.66-1.021 3.143-1.812 4.43h-23.12a17.212 17.212 0 001.604 1.856c1.293 1.301 2.847 2.483 4.551 3.482h12.046a26.945 26.945 0 01-4.791 2.931 37.983 37.983 0 019.203 4.442z"/></svg>');
	pointer-events: none;
	position: absolute;
	left: 50%;
	top: 50%;
	width: 50px;
	height: 100px;
	transform: translate(-50%, -50%) scale(0.5);
	filter: invert();
	opacity: 0.25;
	transition: transform 0.2s ease, opacity 0.2s ease;
}
.mutagen-breeding-slot.over {
	border-color: #aaa;
}
.mutagen-breeding-slot.over::before {
	transform: translate(-50%, -50%) scale(0.7);
	opacity: 0.5;
}
.mutagen-breeding-slot .mutagen-thumbnail {
	z-index: 1;
}
.mutagen-breeding-slot.over .mutagen-thumbnail {
	opacity: 0;
}
#mutagen-thumbnails-container {
	flex: 1;
}
.mutagen-thumbnail {
	cursor: pointer;
	vertical-align: top;
	border: 2px dashed transparent;
	transition: opacity 0.2s ease;
}
.mutagen-thumbnail.dragging {
	opacity: 0.4;
}
#mutagen-ui-container .export-results {
	display: inline-block;
}
#mutagen-ui-container .download {
	padding: 15px;
	display: inline-block;
	font-size: 1em;
}
`;
var style = document.createElement("style");
style.id = "mutagen-style";
document.head.appendChild(style);
style.type = "text/css";
style.appendChild(document.createTextNode(css));


var existing_thumbnails_container = document.querySelector("#mutagen-thumbnails-container"); // history palette / specimen palette
var existing_ui_container = document.querySelector("#mutagen-ui-container"); // history palette / specimen palette
var thumbnails = [];

var ui_container = document.createElement("div");
ui_container.id = "mutagen-ui-container";
var toolbar = document.createElement("div");
toolbar.id = "mutagen-toolbar";
var breeding_bar = document.createElement("div");
breeding_bar.id = "mutagen-breeding-bar";
var breeding_actions = document.createElement("div");
breeding_actions.id = "mutagen-breeding-actions";
var breeding_slots_container = document.createElement("div");
breeding_slots_container.id = "mutagen-breeding-box";
breeding_slots_container.className = "mutagen-thumbnails-list";
var thumbnails_container = document.createElement("div");
thumbnails_container.id = "mutagen-thumbnails-container";
thumbnails_container.className = "mutagen-thumbnails-list";
breeding_bar.appendChild(breeding_slots_container);
breeding_bar.appendChild(breeding_actions);
ui_container.appendChild(toolbar);
ui_container.appendChild(breeding_bar);
ui_container.appendChild(thumbnails_container);
document.body.appendChild(ui_container);

if (existing_thumbnails_container) {
	Array.from(existing_thumbnails_container.querySelectorAll(".mutagen-thumbnail")).forEach((thumbnail_img)=> {
		add_thumbnail(thumbnail_img.dataset.code, thumbnail_img.src);
	});
}
if (existing_ui_container) {
	existing_ui_container.remove();
}

ui_container.addEventListener("click", (event)=> {
	if (!event.target.classList.contains("mutagen-thumbnail")) {
		return;
	}
	var thumbnail_img = event.target;
	try {
		window.mutagen_stop();
	} catch(e) {}
	set_code_on_page(thumbnail_img.dataset.code);
	compile_code_on_page();
});
thumbnails_container.addEventListener("dblclick", (event)=> {
	if (!event.target.classList.contains("mutagen-thumbnail")) {
		return;
	}
	var thumbnail_img = event.target;
	try {
		window.mutagen_stop();
	} catch(e) {}
	set_code_on_page(thumbnail_img.dataset.code);
	mutate_code_on_page();
});

var dragging_el = null;

function record_thumbnail() {
	if (!output_canvas) {
		return;
	}
	var code = get_code_from_page();
	if (thumbnails.some((el)=> el.dataset.code === code)) {
		return;
	}
	add_thumbnail(code);
}

function add_thumbnail(code, img_src) {
	var thumbnail_img = document.createElement("img");
	thumbnail_img.className = "mutagen-thumbnail";
	if (img_src) {
		thumbnail_img.src = img_src
	} else {
		thumbnail_ctx.clearRect(0, 0, thumbnail_canvas.width, thumbnail_canvas.height);
		thumbnail_ctx.drawImage(output_canvas, 0, 0, thumbnail_canvas.width, thumbnail_canvas.height);
		thumbnail_img.src = thumbnail_canvas.toDataURL();
	}
	thumbnail_img.width = thumbnail_canvas.width;
	thumbnail_img.height = thumbnail_canvas.height;
	thumbnail_img.dataset.code = code;
	thumbnail_img.tabIndex = 0;
	// thumbnail_img.setAttribute("role", "button");
	thumbnails_container.appendChild(thumbnail_img);
	thumbnail_img.setAttribute("draggable", "draggable"); // probably not necessary since it happens to be an img
	
	thumbnails.push(thumbnail_img);
	invalidate_export_links();
}
document.addEventListener("dragstart", (event)=> {
	var thumbnail_img = event.target.closest(".mutagen-thumbnail");
	// var slot = event.target.closest(".mutagen-breeding-slot");
	if (!thumbnail_img) {
		return;
	}
	event.dataTransfer.dropEffect = "copy";
	event.dataTransfer.setData('text/plain', thumbnail_img.dataset.code);
	thumbnail_img.classList.add("dragging");
	dragging_el = thumbnail_img;
});

document.addEventListener("dragend", (event)=> {
	Array.from(document.querySelectorAll(".mutagen-breeding-slot, .mutagen-thumbnail")).forEach((el)=> {
		el.classList.remove("over");
		el.classList.remove("dragging");
	});
	dragging_el = null; // (drop comes before dragend)
});

document.addEventListener("dragover", (event)=> {
	var slot = event.target.closest(".mutagen-breeding-slot");
	if (!slot) {
		return;
	}
	event.preventDefault();
	return false;
});
document.addEventListener("dragenter", (event)=> {
	if (!dragging_el) {
		return;
	}
	var slot = event.target.closest(".mutagen-breeding-slot");
	if (!slot) {
		return;
	}
	slot.classList.add("over");
});
document.addEventListener("dragleave", (event)=> {
	var slot = event.target.closest(".mutagen-breeding-slot");
	if (!slot) {
		return;
	}
	if (!event.relatedTarget) {
		// ...not sure what to do here, not sure when this happens
		console.log("no event.relatedTarget during dragleave", event);
		return;
	}
	if (event.relatedTarget.closest(".mutagen-breeding-slot") !== slot) {
		slot.classList.remove("over");
	}
});
document.addEventListener("drop", (event)=> {
	var slot = event.target.closest(".mutagen-breeding-slot");
	if (!slot) {
		return;
	}
	event.stopPropagation();
	if (!dragging_el) {
		return;
	}
	slot.innerHTML = "";
	var thumbnail_clone = dragging_el.cloneNode();
	slot.appendChild(thumbnail_clone);

	return false;
});


function make_breeding_slot() {
	var slot = document.createElement("div");
	slot.className = "mutagen-breeding-slot";
	return slot;
}

var breeding_slots = [];
for (let i=0; i<num_breeding_slots; i++) {
	let slot = make_breeding_slot();
	breeding_slots_container.appendChild(slot);
	breeding_slots.push(slot);
}

function is_output_canvas_interesting() {
	test_ctx.clearRect(0, 0, test_canvas.width, test_canvas.height);
	test_ctx.drawImage(output_canvas, 0, 0, test_canvas.width, test_canvas.height);

	var image_data = test_ctx.getImageData(0, 0, test_canvas.width, test_canvas.height);
	var {data} = image_data;

	// TODO: test for maybe 40% of any of four sides being blank
	// and actually give a scalar fitness rating
	// TODO: make it more perceptual in the color difference, i.e. treating similar brightnesses more similarly
	// and maybe don't look at the very edges because just a vignette isn't very interesting
	var [r, g, b] = data;
	var threshold = 25;
	var interesting = false;
	for (var i=0; i<data.length; i+=4) {
		var diff =
			Math.abs(data[i+0] - r) +
			Math.abs(data[i+1] - g) +
			Math.abs(data[i+2] - b);
		if (diff > threshold) {
			interesting = true;
		}
	}
	return interesting;
}

function is_compiling() {
	// shadertoy
	var compile_status_el = document.querySelector("#compilationTime");
	if (compile_status_el) {
		return compile_status_el.textContent.match(/Compiling/i);
	}
	// bytebeat
	if ((location.origin + location.pathname).match(/bytebeat/i)) {
		return false; // bytebeat compiles synchronously
	}

	return false;
}
function compile_code_on_page() {
	
	var compile_button = document.querySelector("[title~='Compile']"); // shadertoy
	if (compile_button) {
		compile_button.click(); 
	} else if (window.compile) {
		window.compile(get_code_from_page()); // bytebeat
	}

	return new Promise((resolve, reject)=> {
		function wait_for_compile_end() {
			if (is_compiling()) {
				setTimeout(wait_for_compile_end, 50);
			} else {
				setTimeout(()=> { // may not be needed!
					var error = find_problem_in_output_on_page();
					if (error) { reject(error); } else { resolve(); }
				}, 5);
			}
		}
		wait_for_compile_end();
	});
}
function generate_edits(doc) {
	var edit_points = doc.filter((part)=> typeof part !== "string");
	var mutation_chance = 0.01 + (0.5 / edit_points.length);
	var min_edits = 5;
	var max_tries_to_reach_min_edits = 50;
	var tries_to_reach_min_edits = 0;
	var edits;
	do {
		edits = [];
		for (var i=0; i<doc.length; i++) {
			var part = doc[i];
			if (part.type === "number_literal") {
				var mutated_number_literal = mutate_number_literal(part.text, mutation_chance);
				if (mutated_number_literal !== part.text) {
					edits.push({
						index_in_doc: i,
						text: mutated_number_literal,
						_original_text: part.text, // for debug
						_from_part: part, // for debug
					});
				}
			}
		}
		tries_to_reach_min_edits++;
		mutation_chance *= 1.5;
		// console.log(`${edits.length} possible edits`);
	} while (tries_to_reach_min_edits < max_tries_to_reach_min_edits && edits.length < min_edits);
	// console.log(`${edits.length} possible edits in ${tries_to_reach_min_edits} tries`);
	return edits;
}
// TODO: weighted random chances
function generate_edits_by_breeding(base_doc, docs, weights) {
	// make edits for every edit point
	// It might be good in the future to apply only needed edits in CodeMirror & Ace editors,
	// but for now it doesn't matter if we create "edits" where the docs actually match.

	// TODO: throw?
	console.assert(docs.length === weights.length, "number of docs and weights must match");
	var doc_length = docs[0].length;
	for(const doc of docs) {
		console.assert(doc.length === doc_length, "doc lengths should match");
	}
	var edits = [];
	for (var i=0; i<base_doc.length; i++) {
		var base_part = base_doc[i];
		var part_options = docs.map((doc)=> doc[i]);
		// Note: parts can be strings or edit point objects
		for (const part of part_options) {
			console.assert(part.type === base_part.type, "part types should match");
		}
		if (base_part.type === "number_literal") {
			var part = part_options[Math.floor(Math.random() * part_options.length)];
			edits.push({
				index_in_doc: i,
				text: part.text,
				_part_chosen: part, // for debug
				_part_options: part_options, // for debug
			});
		}
	}
	// console.log("breeding edits:", edits);
	return edits;
}

var choose = (array)=> array[~~(array.length * Math.random())];

var logo_canvas = document.createElement("canvas");
var logo_ctx = logo_canvas.getContext("2d");
logo_canvas.width = 100;
logo_canvas.height = 10;

// for debug
var existing_logo_canvas = document.getElementById("mutagen-logo-canvas-debug");
if (existing_logo_canvas) { existing_logo_canvas.remove(); }
if (window.mutagen_debug_logo) {
	logo_canvas.id = "mutagen-logo-canvas-debug";
	document.body.appendChild(logo_canvas);
	logo_canvas.style.position = "absolute";
	logo_canvas.style.left = "0";
	logo_canvas.style.top = "0";
	logo_canvas.style.transform = "scale(10)";
	logo_canvas.style.transformOrigin = "top left";
	logo_canvas.style.imageRendering = "crisp-edges";
	logo_canvas.style.imageRendering = "pixelated";
	logo_canvas.style.background = "rgba(0, 0, 0, 1)";
}

function draw_logo() {
	logo_ctx.clearRect(0, 0, logo_canvas.width, logo_canvas.height);
	// logo_ctx.fillRect(0, 0, 5, 5);
	logo_ctx.save();
	logo_ctx.scale(logo_canvas.height, logo_canvas.height);
	logo_ctx.translate(0.5, 0.5);
	logo_ctx.scale(0.7, 0.7);
	logo_ctx.translate(-0.5, -0.5);
	var letter_spacing = 0.5;
	var m_slantedness = Math.random() * 0.8;
	var m_width = 1.4 + m_slantedness * 0.8;
	var a_roundedness = 1 - Math.random() * 0.6;
	var letter_data = [
		{
			letter: "M",
			points: [
				[0, 1],
				[0.25 * m_slantedness * m_width, 0],
				[0.5 * m_width, 1 - Math.random() * 0.25],
				[(1 - 0.25 * m_slantedness) * m_width, 0],
				[1 * m_width, 1],
			],
			width: m_width,
			kern_after: -m_slantedness * 0.2,
		},
		{
			letter: "U",
			points: [
				[0, 0],
				[0, 0.5],
				[0.2, 0.8],
				[0.5, 1],
				[0.8, 0.8],
				[1, 0.5],
				[1, 0],
			],
			kern_after: -0.15,
		},
		{
			letter: "T",
			points: [
				[0, 0],
				[1, 0],
				[0.5, 0],
				[0.5, 1],
			],
			kern_after: -0.3,
		},
		{
			letter: "A",
			strokes: [
				[
					[0, 1],
						[0 + (1/8 - a_roundedness * 0.2), 3/4],
							[0 + (1/4 - a_roundedness * 0.25), 1/2],
								[0 + (3/8 - a_roundedness * 0.3), 1/4 * (1-a_roundedness/2)],
									[0.5, 0],
								[1 - (3/8 - a_roundedness * 0.3), 1/4 * (1-a_roundedness/2)],
							[1 - (1/4 - a_roundedness * 0.25), 1/2],
						[1 - (1/8 - a_roundedness * 0.2), 3/4],
					[1, 1],
				],
				[
					[0.2-Math.random()*0.2, 0.75 - a_roundedness * 0.2],
					[0.8+Math.random()*0.2, 0.75 - a_roundedness * 0.2],
				]
			],
			kern_after: -0.15,
		},
		{
			letter: "G",
			points: [
				[0.9, 0.01],
				[0.5, 0],
				[0.4, 0.1],
				[0.2, 0.4],
				[0, 0.5],
				[0.2, 0.7],
				[0.5, 1],
				[0.7, 0.9],
				[1, 0.7],
				[1, 0.5],
				[0.6, 0.5],
			],
		},
		{
			letter: "E",
			points: [
				[1, 0],
				[0, 0],
				[0, 0.5],
				[0.7, 0.5],
				[0, 0.5],
				[0, 1],
				[1, 1],
			],
		},
		{
			letter: "N",
			points: [
				[0, 1],
				[0, 0],
				[1, 1],
				[1, 0],
			],
		},
	];
	var rand = Math.random();
	var rand2 = Math.random();
	var lw_inc = 0;
	for (var letter of letter_data) {
		var {points, strokes, width, kern_after} = letter;
		width = width || 1;
		kern_after = kern_after || 0;
		strokes = strokes || [points];
		var letter_width_scale = 1 + Math.random() * 0.4;
		var letter_width = width * letter_width_scale;
		logo_ctx.save();
		logo_ctx.scale(letter_width_scale, 1);
		// TODO: increase letter spacing around rotated letters
		var rotation = (Math.random() - 1/2) * 0.2;
		logo_ctx.rotate(rotation);
		for (var stroke_i=0; stroke_i<strokes.length; stroke_i++) {
			var points = strokes[stroke_i];
			for (var i=0; i<points.length-1; i++) {
				var a = points[i];
				var b = points[i+1];
				a.x += Math.random() * 0.05;
				a.y += Math.random() * 0.05;
				b.x += Math.random() * 0.05;
				b.y += Math.random() * 0.05;
				logo_ctx.beginPath();
				logo_ctx.moveTo(a[0], a[1]);
				logo_ctx.lineTo(b[0], b[1]);
				lw_inc += Math.random();
				logo_ctx.lineWidth = 0.04 + Math.max(0, 0.1 * Math.sin(lw_inc / 5 * rand2 + rand * 5) * Math.sin(lw_inc / 50 + rand*19));
				logo_ctx.strokeStyle = "white";
				logo_ctx.stroke();
			}
		}
		logo_ctx.restore();
		logo_ctx.translate(letter_width + letter_spacing + kern_after, 0);
	}
	logo_ctx.restore();

	var chars = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█"; // semantically pure, but not monospace
	// var chars = "▁▘▝▛▖▛▞▛▗▚▜▜▅▙▟▇"; // actually monospace, but wider than a space
	// var chars = " ▀▄▌▐█"; // good, monospace, normal space sized characters

	var image_data = logo_ctx.getImageData(0, 0, logo_canvas.width, logo_canvas.height);
	var at = (x, y)=>
		(image_data.data[
			((y * image_data.width) + x) * 4 + 3
		] / 256) > 0.1;
	console.assert(logo_canvas.width % 2 === 0, "we're assuming an even number of pixels for accessing image data");
	console.assert(logo_canvas.height % 2 === 0, "we're assuming an even number of pixels for accessing image data");

	var grid = [];
	for (var y=0; y<logo_canvas.height; y+=2) {
		var row = [];
		for (var x=0; x<logo_canvas.width; x+=2) {
			var upper_left = at(x, y);
			var upper_right = at(x+1, y);
			var lower_left = at(x, y+1);
			var lower_right = at(x+1, y+1);
			var char = chars[0 + upper_left + upper_right*2 + lower_left*4 + lower_right*8];
			row.push(char);
		}
		grid.push(row);
	}

	// add some particles...
	grid.forEach((row, row_index)=> {
		row.forEach((char, char_index)=> {
			if (char !== " ") {
				if (Math.random() < 0.5) {
					var particle_char = choose("·.•▪");
					var x = char_index + choose([-2, -1, -1, 0, 1, 1, 2]);
					var y = row_index + choose([-2, -1, -1, 0, 1, 1, 2]);
					if (y >= 0 && x >= 0 && y < grid.length && x < grid[y].length) {
						if (grid[y][x] === " ") {
							grid[y][x] = particle_char;
						}
					}
				}
			}
		});
	});

	var logo = grid.map((row)=> row.join("")).join("\n");

	// substitute block element characters that aren't rendered as fixed width by CodeMirror
	// with simpler shapes that are rendered the same width as a space
	var ch_top = "▀";
	var ch_bottom = "▄";
	var ch_left = "▌";
	var ch_right = "▐";
	var ch_full = "█";
	logo = logo
		.replace(/▘/g, ()=> choose([ch_left, ch_top]))
		.replace(/▝/g, ()=> choose([ch_right, ch_top]))
		.replace(/▗/g, ()=> choose([ch_right, ch_bottom]))
		.replace(/▖/g, ()=> choose([ch_left, ch_bottom]))
		.replace(/[▛▜▟▙▚▞]/g, ch_full);

	return logo;
}

var attribution_header_start = `// Based on`;
var attribution_header_end = `code mutation tool by Isaiah Odhner)`;

function get_attribution_header() {
	// TODO: handle shaders being edited (don't say "Based on" I suppose? get name title from input)
	var title_el = document.querySelector("#shaderTitle, title");
	var author_name_el = document.querySelector("#shaderAuthorName");
	var author_date_el = document.querySelector("#shaderAuthorDate");
	var title = title_el && title_el.textContent;
	var author_name = author_name_el && author_name_el.textContent;
	var author_date = author_date_el && author_date_el.textContent;
	var author_year = author_date && author_date.replace(/-.*/, "");

	if (title && author_name && author_year) {
		var based_on = `Based on "${title}" by ${author_name} - ${author_year}

${location.href}`;
	} else {
		var based_on = `Based on:
${location.href}`;
	}
// 	var logo = `
// • ▌ ▄ ·. ▄• ▄▌▄▄▄▄▄ ▄▄▄·  ▄▄ • ▄▄▄ . ▐ ▄ 
// ·██ ▐███▪█▪██▌•██  ▐█ ▀█ ▐█ ▀ ▪▀▄.▀·•█▌▐█
// ▐█ ▌▐▌▐█·█▌▐█▌ ▐█.▪▄█▀▀█ ▄█ ▀█▄▐▀▀▪▄▐█▐▐▌
// ██ ██▌▐█▌▐█▄█▌ ▐█▌·▐█ ▪▐▌▐█▄▪▐█▐█▄▄▌██▐█▌
// ▀▀  █▪▀▀▀ ▀▀▀  ▀▀▀  ▀  ▀ ·▀▀▀▀  ▀▀▀ ▀▀ █▪
// `;
// 	logo = logo.replace(/[·.•▪]/g, ()=> choose("·.•▪"));
	var logo = draw_logo();
	var header = `${based_on}


randomly mutated with...

${logo}

https://github.com/multiism/mutagen
(MUTAGEN, code mutation tool by Isaiah Odhner)`;
	var line_comment_token = "//";
	header = header.replace(/(^|\n)/g, `$1${line_comment_token} `).split("\n").map((line)=> line.trimEnd()).join("\n");
	console.assert(header.indexOf(attribution_header_start) === 0, "attribution_header_start didn't match at start of header");
	console.assert(header.indexOf(attribution_header_end) === header.length - attribution_header_end.length, "attribution_header_end didn't match at end of header");
	return header;
}
function add_or_replace_attribution_header(code) {
	var header = get_attribution_header();
	code = remove_attribution_header(code);
	// this is pretty silly trying to be language-agnostic here
	// (if we're gonna handle other languages that have e.g. # for comments, we'll already need to change/disable the header)
	// (and alternatively we could detect the language when adding support for coffeescript and python and all that)
	// but -- = lua, # = coffeescript, python, avoiding matching preprocessor directives
	var next_is_comment = code.match(/^\s*(\/[/*]|--|#(?!if|define|pragma|extension|include|version|error))/);
	var newlines = next_is_comment ? "\n\n\n\n\n" : "\n\n\n";
	code = header + newlines + code.replace(/^\s*\n/, "");
	return code;
}
function remove_attribution_header(code) {
	var header_start_index = code.indexOf(attribution_header_start);
	var end_start_index = code.indexOf(attribution_header_end);
	if (header_start_index > -1 && end_start_index > -1) {
		var header_end_index = end_start_index + attribution_header_end.length;
		code = code.slice(0, header_start_index) + code.slice(header_end_index);
	}
	return code;
}

async function try_edits(doc, edits) {
	var new_code = render_doc_to_string(doc, edits);
	new_code = add_or_replace_attribution_header(new_code);
	set_code_on_page(new_code);
	try {
		await compile_code_on_page(new_code);
	} catch (error) {
		return error;
	}
}

function bifurcate(array) {
	return [
		array.slice(0, array.length/2),
		array.slice(array.length/2),
	];
}

async function mutate_code_on_page() {
	try {
		window.mutagen_stop();
	} catch(e) {}

	mutate_button.disabled = true;
	abort_button.disabled = false;

	var original_code = get_code_from_page();

	var stopped = false;
	var roll_back_code = ()=> {
		console.log("reset to original code");
		set_code_on_page(original_code);
		compile_code_on_page();
	};
	var stop = ()=> {
		stopped = true;
		abort_button.disabled = true;
		setTimeout(()=> { mutate_button.disabled = false; }, 200);
	};
	window.mutagen_stop = ()=> {
		if (stopped) {
			return;
		}
		console.log("abort");
		stop();
		roll_back_code();
	};

	var doc = parse_for_edit_points(original_code);

	var max_edit_set_tries = 5;
	for (var edit_set_tries = 0; edit_set_tries < max_edit_set_tries; edit_set_tries++) {
		var edits = generate_edits(doc);

		/* pseudo-code for the following algorithm

		Accepted edits := none
		Rejected edits := none
		Recurse(unvetted edits):
			Try with all accepted + unvetted edits
			If good,
				Accepted edits += unvetted edits
			Else
				If unvetted edits is just one edit
					Rejected edits += unvetted edits
				else
					[left, right] := bifurcate(unvetted edits)
					Recurse(left)
					Recurse(right)
		Recurse(all edits)
		Use accepted edits
		*/

		var accepted_edits = [];
		var rejected_edits = [];

		async function recursively_try_edit_set(unvetted_edits) {
			// console.log("recursively_try_edit_set", unvetted_edits);
			if (unvetted_edits.length === 0) {
				return;
			}
			if (stopped) {
				console.log("abort from recursively_try_edit_set");
				return;
			}

			// first, apply all edits and see if it works
			let edits_to_try = [...accepted_edits, ...unvetted_edits];

			var error = await try_edits(doc, edits_to_try);
			// console.log("tried", edits_to_try, "got", error);
			if (!error) {
				console.log("accepting edits:", unvetted_edits);
				accepted_edits = accepted_edits.concat(unvetted_edits);
				record_thumbnail();
			} else {
				// console.log(unvetted_edits, error);
				if (unvetted_edits.length <= 1) {
					console.log("rejecting edits:", unvetted_edits, "because", error.message);
					rejected_edits = rejected_edits.concat(unvetted_edits);
				} else {
					var [left, right] = bifurcate(unvetted_edits);
					await recursively_try_edit_set(left);
					await recursively_try_edit_set(right);
				}
			}
		}
		await recursively_try_edit_set(edits);

		if (stopped) {
			console.log("abort from mutate_code_on_page");
			return;
		}

		// set code on page to use accepted edits and recompile
		await try_edits(doc, accepted_edits);

		var new_code = render_doc_to_string(doc, accepted_edits);
		new_code = add_or_replace_attribution_header(new_code);
		var new_code_from_page = get_code_from_page();

		var _original_code = remove_attribution_header(original_code).trim()
		var _new_code = remove_attribution_header(new_code).trim()
		var _new_code_from_page = remove_attribution_header(original_code).trim();

		// for debug
		window._original_code = _original_code;
		window._new_code = _new_code;
		window._new_code_from_page = _new_code_from_page;

		if (_new_code === _original_code) {
			console.log(`_new_code is same as _original_code, LAME (edit set try: ${edit_set_tries+1}/${max_edit_set_tries})`);
		} else if (_original_code === _new_code_from_page) {
			console.log(`failed to set code on page, or it isn't updated yet at the time of testing (race condition?)`);
			// TODO: try again? fix race condition?
			stop();
			return;
		} else if (_new_code !== _new_code_from_page) {
			console.log(`failed to set code on page to the exact code string, or there's a race condition`);
			stop();
			return;
		} else {
			console.assert(accepted_edits.length > 0);
			console.log("mutation finished", {accepted_edits});
			stop();
			return;
		}
	}
	console.log("mutation unsuccessful");
	stop();
	roll_back_code();
}

// TODO: DRY
async function breed(docs, weights) {
	try {
		window.mutagen_stop();
	} catch(e) {}

	var base_doc = docs[0];
	if (!base_doc) {
		alert("Nothing to breed. Drag some thumbnails to the breeding slots.");
		return;
	}
	// TODO: check that document_structures_are_equivalent

	mutate_button.disabled = true;
	abort_button.disabled = false;

	var original_code = get_code_from_page();

	var stopped = false;
	var roll_back_code = ()=> {
		console.log("reset to original code");
		set_code_on_page(original_code);
		compile_code_on_page();
	};
	var stop = ()=> {
		stopped = true;
		abort_button.disabled = true;
		setTimeout(()=> { mutate_button.disabled = false; }, 200);
	};
	window.mutagen_stop = ()=> {
		if (stopped) {
			return;
		}
		console.log("abort");
		stop();
		roll_back_code();
	};

	var max_edit_set_tries = 150;
	for (var edit_set_tries = 0; edit_set_tries < max_edit_set_tries; edit_set_tries++) {
		var edits_to_try = generate_edits_by_breeding(base_doc, docs, weights);

		if (stopped) {
			console.log("abort from breed");
			return;
		}

		var error = await try_edits(base_doc, edits_to_try);
		// console.log("tried", edits_to_try, "got", error);
		if (!error) {
			stop();
			console.log("breeding success");
			record_thumbnail();
			return;
		} else {
			set_code_on_page(original_code);
			compile_code_on_page();
		}
	}
	console.log("breeding unsuccessful");
	alert("breeding unsuccessful");
	stop();
	// TODO: reset code to original
}

var mutate_button = document.createElement("button");
mutate_button.id = "mutate";
mutate_button.textContent = "☢ MUTATE ☢";
mutate_button.onclick = async function() {
	await mutate_code_on_page();
};

var abort_button = document.createElement("button");
abort_button.id = "mutagen-abort";
abort_button.textContent = "ABORT";
abort_button.onclick = ()=> {
	window.mutagen_stop();
};
abort_button.disabled = true;


var breed_button = document.createElement("button");
breed_button.id = "mutagen-breed-button";
breed_button.textContent = "Breed";
breed_button.onclick = ()=> {
	const selected_thumbnails = Array.from(document.querySelectorAll("#mutagen-breeding-box .mutagen-thumbnail"));
	const selected_codes = selected_thumbnails.map((thumbnail)=> thumbnail.dataset.code);
	const selected_docs = selected_codes.map(parse_for_edit_points);
	breed(selected_docs, selected_docs.map(()=> 1));
};

var clear_breeding_box_button = document.createElement("button");
clear_breeding_box_button.id = "mutagen-clear-button";
clear_breeding_box_button.textContent = "Clear";
clear_breeding_box_button.onclick = ()=> {
	Array.from(document.querySelectorAll(".mutagen-breeding-slot")).forEach((breeding_slot)=> {
		breeding_slot.innerHTML = "";
	});
};

var export_button = document.createElement("button");
export_button.textContent = "Export Code & Thumbnails";
export_button.onclick = export_thumbnails;
var export_results = document.createElement("div");
export_results.className = "export-results";

function invalidate_export_links(){
	export_results.innerHTML = "";
}

function export_thumbnails(){
	export_results.innerHTML = "";

	var all_code = thumbnails.map((thumbnail)=> thumbnail.dataset.code).join("\n----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------\n");
	var all_code_blob = new Blob([all_code], {type: 'text/plain'});
	
	var url = URL.createObjectURL(all_code_blob);
	var a = document.createElement("a");
	a.href = url;
	a.download = "mutagen-thumbnails.glsl.txt";
	a.className = "download download-code";
	a.textContent = "download combined code";
	export_results.appendChild(a);
	
	var thumbs_per_row = 5;
	var canvas = document.createElement("canvas");
	var ctx = canvas.getContext("2d");
	canvas.width = thumbnails[0].width * thumbs_per_row;
	canvas.height = thumbnails[0].height * (Math.ceil(thumbnails.length / thumbs_per_row));
	for (var i=0; i<thumbnails.length; i++) {
		ctx.drawImage(
			thumbnails[i],
			(i % thumbs_per_row) * thumbnails[0].width,
			(~~(i / thumbs_per_row)) * thumbnails[0].height
		);
	}
	canvas.toBlob((blob)=> {
		var url = URL.createObjectURL(blob);
		var a = document.createElement("a");
		a.className = "download download-thumbnails";
		a.href = url;
		a.download = "mutagen-thumbnails.png";
		a.textContent = "download combined thumbnails screenshot";
		export_results.appendChild(a);
	});	
}

toolbar.appendChild(mutate_button);
toolbar.appendChild(abort_button);
toolbar.appendChild(export_button);
toolbar.appendChild(export_results);
breeding_actions.appendChild(breed_button);
breeding_actions.appendChild(clear_breeding_box_button);

try {
	window.mutagen_stop();
} catch(e) {}

record_thumbnail();

/*
FIXME: canvas snapshotted and/or tested for blankness before the shader is loaded and rendered

TODO: improve handling of shadertoy tabs:
	protect against switching tabs while mutations are being made
	detect errors only in selected tab
	don't bother looking at the canvas if modifying the Sound tab

Some other things that would be good:

GUI:
	add some text explaining the double click if that's gonna be a thing
	a draggable, resizable window to put the GUI in
	background process cursor while mutating?

thumbnail/history/specimen grid/palette:
	maybe create stacks when a single mutation session generates interim results
	option to generate a bunch at a time, with rows or stacks
	rows could be from progressively accepting subsets of one changeset,
	and then there'd be a few rows, with totally different changesets
	delete thumbnails (with undo)
	animation (a few frames)? (on hover or always?)
	collapse stacks of similar looking frames? (would need a similarity metric)
	allow sort/arrange by:
		time created (current order)
		ancestry (need to store what something was generated from) (and then just flatten the tree)
			maybe optional tree view vs flattened grid view
				w/ icons like Ꮬ ⸬
			https://en.wikipedia.org/wiki/Phylogenetic_tree
		or t-SNE
			https://cs.stanford.edu/people/karpathy/tsnejs/
			(we have these "edit points" to work with, that are currently all numbers)
			(question: how much does magnitude matter? might it mess things up? would log help? or is that already built in?)
			(i suppose any edit points that don't have a visible effect would make it worse,
			but i'm curious how well it might do with just a naive implementation)
			(MAYBE an option of a flattened grid view, using a one-dimensional t-SNE? or 2D constrained to N columns somehow)

operate on selection if there's a selection (and update bounds of selection)
	should handle multiple selections for editors like codemirror and ace

platform support
	support bytebeat again on windows93.net (in iframe)
	khan academy, including "error buddy" detection
	code fiddles like jsfiddle, codepen, jsbin, fiddle salad
	shaderoo.org (ace editor)
	see "Shadertoy cousins" on https://shadertoyunofficial.wordpress.com/2017/07/25/extending-shadertoy/

wrap values sometimes in a function, like i did for:
	https://www.khanacademy.org/computer-programming/phantasmagoria/2540238893
	https://www.khanacademy.org/computer-programming/phantasmagoria-plus/6066580222902272
	oooh, aside from just introducing varying and interesting animation,
		it could use *sound* specifically as an input, so it makes things into visualizers :D

a mode where mutations are applied only after the time when they were generated/applied
	allowing for playback of the history of mutation
	time > ${get_time_from_page()} ? mutation : original
	(time as in iTime in shadertoy, t in bytebeat; could create a startTime variable to compare against in other environments (jsfiddle etc.))

save code of all shadertoy tabs?

maybe export an image with all the thumbnails, with all the codes embedded, that you can load back in and pick from

correlate and reconcile semi-related programs for breeding? / haphazardly mash them up?
	this would involve a lot more domain knowledge of the language and platform
	(e.g. glsl functions and for shadertoy the mainImage and mainSound entry points)
	and idk how this would work

*/
