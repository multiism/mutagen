function find_edit_points(code) {
	var doc = [];
	var edits = [];

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
			var edit = {
				type: "number_literal",
				original_str: num_str,
				mutation_str: num_str,
			};
			edits.push(edit);
			doc.push(edit);
		}
		last_match_lastIndex = numbers_regexp.lastIndex;
	}
	doc.push(code.slice(last_match_lastIndex));

	return {doc, edits};
}
function find_edit_points_skipping_line_comments(code) {
	// TODO: loosely ignore block comments too
	// (ignoring the complexity of things in strings, like `"// /* /*/"`, or `var rgx = /http:\/\/foo\/*/i`)

	var doc = [];
	var edits = [];

	code.split("\n").forEach((line)=> {
		if (line.match(/^\s*\/\//)) {
			doc.push(line);
		} else {
			var line_stuff = find_edit_points(line);
			doc = doc.concat(line_stuff.doc);
			edits = edits.concat(line_stuff.edits);
		}
		doc.push("\n");
	});

	return {doc, edits};
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
	}

	if (Math.random() < mutation_chance) { n += 1; }
	if (Math.random() < mutation_chance) { n -= 1; }
	if (Math.random() < mutation_chance) { n /= 2; }
	if (Math.random() < mutation_chance) { n *= 2; }
	if (isNaN(n)) {
		console.warn(`somehow got ${n} from ${JSON.stringify(num_str)}`);
		return num_str;
	} else if (n < 0 && original_n >= 0) {
		return `(${keep_as_int_or_float(n)})`;
	}
	return keep_as_int_or_float(n);
}

function render_doc_to_string(doc, edits_to_include) {
	return doc.map((part)=> {
		if (typeof part === "string") {
			return part;
		} else if (edits_to_include.includes(part)) {
			return part.mutation_str;
		} else {
			return part.original_str;
		}
	}).join("");
}

function get_code_from_page() {
	//var textarea = document.querySelector("#code");
	//var original_code = textarea.value;
	var cm = document.querySelector('.CodeMirror').CodeMirror;
	return cm.getValue();
}
function set_code_on_page(new_code) {
	// TODO for bytebeat: would seem to need to be async
	//textarea.focus();
	//setTimeout(function(){
		//textarea.select();
		//document.execCommand("InsertText", false, new_code);
	//});
	var cm = document.querySelector('.CodeMirror').CodeMirror;
	cm.setValue(new_code);
}

function find_problem_in_output_on_page() {
	// TODO: bytebeat
	var error_message_el = document.querySelector(".CodeMirror-linewidget .errorMessage");
	if (error_message_el && getComputedStyle(error_message_el).visibility !== "hidden") {
		return new Error(`compile failed: ${error_message_el.textContent}`);
	}
	if (document.querySelector(".tab.errorYes")) {
		return new Error("compile failed (in some tab)");
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

function is_output_canvas_interesting() {
	test_ctx.clearRect(0, 0, test_canvas.width, test_canvas.height);
	test_ctx.drawImage(output_canvas, 0, 0, test_canvas.width, test_canvas.height);

	var image_data = test_ctx.getImageData(0, 0, test_canvas.width, test_canvas.height);
	var {data} = image_data;
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
	// TODO: bytebeat
	return document.querySelector("#compilationTime").textContent.match(/Compiling/i);
}
function compile_code_on_page() {
	//compile(new_code); // bytebeat
	document.querySelector("[title~='Compile']").click(); // shadertoy

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
function generate_mutations(edits) {
	var mutation_chance = 0.01 + (0.5 / edits.length);
	var min_edits = 5;
	var max_tries_to_reach_min_edits = 50;
	var tries_to_reach_min_edits = 0;
	var num_edits;
	do {
		for (var edit of edits) {
			if (edit.type === "number_literal") {
				edit.mutation_str = mutate_number_literal(edit.original_str, mutation_chance);
			}
		}
		num_edits = edits.reduce((acc, edit)=> {
			return acc + (edit.original_str !== edit.mutation_str);
		}, 0);
		tries_to_reach_min_edits++;
		mutation_chance *= 1.5;
		// console.log(`${num_edits} possible edits`);
	} while (tries_to_reach_min_edits < max_tries_to_reach_min_edits && num_edits < min_edits);
	// console.log(`${num_edits} possible edits in ${tries_to_reach_min_edits} tries`);
}

var attribution_header_start = `// Based on `;
var attribution_header_end = `code mutation tool by Isaiah Odhner)`;

function get_attribution_header() {
	// TODO: handle shaders being edited (don't say "Based on" I suppose? get name title from input)
	var shader_title = document.querySelector("#shaderTitle").textContent;
	var shader_author_name = document.querySelector("#shaderAuthorName").textContent;
	var shader_author_date = document.querySelector("#shaderAuthorDate").textContent;
	var shader_author_year = shader_author_date.replace(/-.*/, "");
	var header = `// Based on "${shader_title}" by ${shader_author_name} - ${shader_author_year}
//
// ${location.href}
//
//
// randomly mutated with...
// 
// • ▌ ▄ ·. ▄• ▄▌▄▄▄▄▄ ▄▄▄·  ▄▄ • ▄▄▄ . ▐ ▄ 
// ·██ ▐███▪█▪██▌•██  ▐█ ▀█ ▐█ ▀ ▪▀▄.▀·•█▌▐█
// ▐█ ▌▐▌▐█·█▌▐█▌ ▐█.▪▄█▀▀█ ▄█ ▀█▄▐▀▀▪▄▐█▐▐▌
// ██ ██▌▐█▌▐█▄█▌ ▐█▌·▐█ ▪▐▌▐█▄▪▐█▐█▄▄▌██▐█▌
// ▀▀  █▪▀▀▀ ▀▀▀  ▀▀▀  ▀  ▀ ·▀▀▀▀  ▀▀▀ ▀▀ █▪
// 
// (MUTAGEN, pre-alpha code mutation tool by Isaiah Odhner)`;
	console.assert(header.indexOf(attribution_header_start) === 0);
	console.assert(header.indexOf(attribution_header_end) === header.length - attribution_header_end.length);
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

async function try_edits(doc, edits_to_include) {
	var new_code = render_doc_to_string(doc, edits_to_include);
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

	var original_code = get_code_from_page();

	var stopped = false;
	window.mutagen_stop = ()=> {
		if (stopped) {
			return;
		}
		stopped = true;
		console.log("abort - reset to original code");
		set_code_on_page(original_code);
		compile_code_on_page();
	};

	var {doc, edits} = find_edit_points_skipping_line_comments(original_code);

	var max_edit_set_tries = 5;
	for (var edit_set_tries = 0; edit_set_tries < max_edit_set_tries; edit_set_tries++) {
		generate_mutations(edits);

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
		var null_edits = [];
		var unvetted_edits = edits.filter((edit)=> {
			if (edit.original_str === edit.mutation_str) {
				null_edits.push(edit);
				return false;
			}
			return true;
		});

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
		await recursively_try_edit_set(unvetted_edits);

		if (stopped) {
			console.log("abort from mutate_code_on_page");
			return;
		}

		// set code on page to use accepted edits and recompile
		await try_edits(doc, accepted_edits);

		var new_code = render_doc_to_string(doc, accepted_edits);
		new_code = add_or_replace_attribution_header(new_code);
		var new_code_from_page = get_code_from_page();

		console.assert(new_code === new_code_from_page, "got different code from page as should have been generated");

		if (remove_attribution_header(new_code).trim() === remove_attribution_header(original_code).trim()) {
			console.log(`new_code is same as original_code, LAME (edit set try: ${edit_set_tries+1}/${max_edit_set_tries})`);
		} else {
			console.assert(accepted_edits.length > 0);
			console.log("mutation finished", {accepted_edits});
			stopped = true;
			return;
		}
	}
	console.log("mutation finished - unsuccessful");
	stopped = true;
}

function add_buttons_to_page() {
	var existingButton = document.getElementById("mutate");
	if (existingButton) { existingButton.remove(); }
	var existingButton = document.getElementById("mutagen-abort");
	if (existingButton) { existingButton.remove(); }

	var mutateButton = document.createElement("button");
	mutateButton.id = "mutate";
	mutateButton.textContent = "☢ MUTATE ☢";
	mutateButton.onclick = async function() {
		mutateButton.disabled = true;
		abortButton.disabled = false;
		await mutate_code_on_page();
		mutateButton.disabled = false;
		abortButton.disabled = true;
	};

	var abortButton = document.createElement("button");
	abortButton.id = "mutagen-abort";
	abortButton.textContent = "ABORT";
	abortButton.onclick = ()=> {
		window.mutagen_stop();
		abortButton.disabled = true;
		setTimeout(()=> { mutateButton.disabled = false; }, 200);
	};

	var toolbar = document.querySelector("#toolBar, #toolbar, #tool-bar, #controls");
	if (location.hostname.match(/ShaderToy/i)) {
		// let's not bother trying to fit in a layout based around absolute positions
		// just insert it below the toolbar
		toolbar.parentElement.insertBefore(abortButton, toolbar.nextSibling);
		toolbar.parentElement.insertBefore(mutateButton, toolbar.nextSibling);
	} else {
		toolbar.appendChild(mutateButton);
		toolbar.appendChild(abortButton);
	}
}

try {
	window.mutagen_stop();
} catch(e) {}

add_buttons_to_page();
mutate_code_on_page();

/*
Some other things that would be good:

present a grid of thumbnails of a bunch of variations to pick from
	rows could be from progressively accepting subsets of one changeset,
	and then there'd be a few rows, with totally different changesets

operate on selection if there's a selection (and update bounds of selection)
	multiple selections

platform support
	support bytebeat again [on windows93.net too]
	khan academy, including "error buddy" detection
	code fiddles like jsfiddle, codepen, jsbin

wrap values sometimes in a function, like i did for:
	https://www.khanacademy.org/computer-programming/phantasmagoria/2540238893
	https://www.khanacademy.org/computer-programming/phantasmagoria-plus/6066580222902272
*/
