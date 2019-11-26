var thumbnails = Array.from(document.querySelectorAll(".mutagen-thumbnail"));
var all_code = thumbnails.map((thumbnail)=> thumbnail.dataset.code).join("\n----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------\n");
var all_code_blob = new Blob([all_code], {type: 'text/plain'});

var container = document.querySelector("#mutagen-toolbar");
var url = URL.createObjectURL(all_code_blob);
var a = document.createElement("a");
a.href = url;
a.download = "mutagen-thumbnails.glsl.txt";
a.className = "download download-code";
a.textContent = "download combined code from all thumbnails";
container.appendChild(a);

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
	container.appendChild(a);
});
