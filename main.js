
function debug(str) {
    var text = document.createTextNode((str || '') + '\n');
    var e = document.getElementById('container');
    e.appendChild(text);
};


$(document).ready(function () {
    var editor = CodeMirror.fromTextArea(document.getElementById("source"), {
        lineNumbers: true,
        autoCloseBrackets: true
    });

    debug('gpgpu test:\n');
    setTimeout(function () {

        // make array of values
        var dataset = new Float32Array(512 * 512 * 4);
        for (var x = 0; x < dataset.length; x++) {
            dataset[x] = x;
        }

        function runTest() {

            var src = editor.getValue().trim();
            if (src.substring(src.length - 1) == ';')
                src = src.substring(0, src.length - 1);

            var fn = eval('(' + src + ')');
            var shader = glsl(fn);

            try {
                // --- TEST ON CPU ----------------------------------
                console.time('cpu');
                var start_cpu = (new Date()).getTime();
                var output = [];
                for (var x = 0; x < dataset.length; x++) {
                    output[x] = fn(dataset[x]);
                }
                var end_cpu = (new Date()).getTime();
                debug('cpu: ' + (end_cpu - start_cpu) + ' ms');
                console.timeEnd('cpu');

                // --- TEST WITH GPGPU ------------------------------    
                console.time('gpu');
                var start_gpu = (new Date()).getTime();
                //gpgpu('shaders/fragment.glsl', dataset, function (gpuout) {
                var gpout = gpgpu(shader, dataset);
                var end_gpu = (new Date()).getTime();
                debug('gpu: ' + (end_gpu - start_gpu) + ' ms\n');
                console.timeEnd('gpu');
                console.log(gpout);
            } catch (e) {
                debug(e.message + '\n' + e.stack);
            }
        }

        runTest();
        $('#run').onClick(runTest);

    });
});