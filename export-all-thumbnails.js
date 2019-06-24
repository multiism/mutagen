var thumbnails = Array.from(document.querySelectorAll(".mutagen-thumbnail"));
var all_code = thumbnails.map((thumbnail)=> thumbnail.dataset.code).join("\n----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------\n");
set_code_on_page(all_code);

var canvas = document.createElement("canvas");
var ctx = canvas.getContext("2d");
canvas.width = thumbnails[0].width * 5;
canvas.height = thumbnails[0].height * (Math.ceil(thumbnails.length / 5));
for (var i=0; i<thumbnails.length; i++) {
	ctx.drawImage(thumbnails[i], (i % 5) * thumbnails[0].width, (~~(i / 5)) * thumbnails[0].height);
}
canvas.toBlob((blob)=> {
	var container = document.querySelector("#mutagen-thumbnails-container");
	var url = URL.createObjectURL(blob);
	var a = document.createElement("a");
	a.href = url;
	a.download = "mutagen-thumbnails.png";
	a.textContent = "download combined thumbnails screenshot";
	container.appendChild(a);
});
