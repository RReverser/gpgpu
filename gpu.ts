/// <reference path="typings/threejs/three.d.ts" />

interface Shader {
	vertex: string;
	fragment: string;
}

interface Size {
	dimension: number;
	length: number;
}

// must disable premultiplied alpha to get use of 
// all 4 bytes of each pixel for computational output
var renderer = new THREE.WebGLRenderer({ premultipliedAlpha: false, antialias: false });
var gl: WebGLRenderingContext = renderer.context;
declare var Proxy: any;
var results = new Map();
results.set(gl, 'gl');
var idx = {};
var proxy = renderer.context = new Proxy(gl, {
	get(target: typeof gl, name: string) {
		var prop = target[name];
		results.set(prop, `gl.${name}`);
		//console.log(`get gl.${name}`);
		if (typeof prop === 'function') {
			return new Proxy(prop, {
				apply(targetFn: Function, thisArg: typeof gl, args: Array<any>) {
					if (thisArg === proxy) {
						thisArg = gl;
					}
					args.forEach((arg, i, args) => {
						if (arg === proxy) {
							args[i] = gl;
						}
					});
					var newResult = targetFn.apply(thisArg, args);
					var newName = `gl_${name}_${name in idx ? ++idx[name] : (idx[name] = 0) }`;
					console.log(newResult ? `${newName} =` : '', results.get(thisArg), `. ${name}(`, ...args.map((arg, i) => {
						return results.get(arg) || (typeof arg !== 'object' && typeof arg !== 'undefined' ? JSON.stringify(arg) : arg);
					}).reduce((res, arg, i) => {
						return res.concat([arg]).concat(i === args.length - 1 ? [] : [',']);
					}, []), ')', ...(newResult !== undefined ? ['=', typeof newResult !== 'object' && newResult !== undefined ? JSON.stringify(newResult) : newResult] : []));
					if (newResult) {
						results.set(newResult, newName);
					}
					return newResult;
				}
			});
		} else {
			return prop;
		}
	}
});
results.set(proxy, 'gl');
if (!gl) throw ("Requires WebGL rendering context!");
if (!gl.getExtension("OES_texture_float")) {
    throw ("Requires OES_texture_float extension");
}
var MAX_TEXTURE_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE) / 4;

//-- Make Float Texture ----------------------------------------------------
// data: an array of values (4 floats per pixel)
// width: (optional)
// height: (optional)
//--------------------------------------------------------------------------
function createFloatingPointTextureFromData(data: Float64Array, size: Size = findBestTextureSize(data.length)) {
    var texture = new THREE.Texture();
    texture.needsUpdate = false;
    texture.__webglTexture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, texture.__webglTexture);

    //console.time('loadTexture');
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size.dimension, size.dimension, 0, gl.RGBA, gl.FLOAT, data);
    texture.__webglInit = false;
    //console.timeEnd('loadTexture');

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}

function findBestTextureSize(length: number) {
    var pixels = length / 4; // rgba
    var sqrt = Math.sqrt(pixels);
    var size: number;

    if (sqrt > MAX_TEXTURE_SIZE) throw new TypeError('Error: Too Much Data. Multiple texure buffers are not yet supported.');
    else if (sqrt > 8192) size = 16384;
    else if (sqrt > 4096) size = 8192;
    else if (sqrt > 2048) size = 4096;
    else if (sqrt > 1024) size = 2048;
    else if (sqrt > 512) size = 1024;
    else if (sqrt > 256) size = 512;
    else if (sqrt > 128) size = 256;
    else if (sqrt > 64) size = 128;
    else if (sqrt > 32) size = 64;
    else if (sqrt > 16) size = 32;
    else if (sqrt > 8) size = 16;
    else if (sqrt > 4) size = 8;
    else if (sqrt > 2) size = 4;
    else size = 2;

    return {
        dimension: size,
        length: size * size * 4 /* return the ideal buffer length */
    };
}

export function gpgpu({ vertex, fragment }: Shader, data: Float32Array) {
    var size = findBestTextureSize(data.length);
    var simRes = size.dimension;
    var cameraRTT = new THREE.OrthographicCamera(simRes / -2, simRes / 2, simRes / 2, simRes / -2, -10000, 10000);
    var sceneRTT = new THREE.Scene();
    var geometry = new THREE.PlaneBufferGeometry(simRes, simRes);
    var uniforms = {
        texture1: { type: "t", value: createFloatingPointTextureFromData(data, size) }
    };
    var material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertex,
        fragmentShader: fragment, //load('shaders/fragment.glsl'),
        blending: 0
    });
    var mesh = new THREE.Mesh(geometry, material);
    sceneRTT.add(mesh);
    var rtTexture = new THREE.WebGLRenderTarget(simRes, simRes, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        depthBuffer: false,
        type: THREE.FloatType
    });
    
    var program = gl.createProgram();
    
    {
		let vertexShader = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vertexShader, vertex);
		gl.compileShader(vertexShader);
		gl.attachShader(program, vertexShader);
		gl.deleteShader(vertexShader);
	}

	{
		let fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fragmentShader, fragment);
		gl.compileShader(fragmentShader);
		gl.attachShader(program, fragmentShader);
		gl.deleteShader(fragmentShader);
	}

    // renderer.render(sceneRTT, cameraRTT, rtTexture, true);
    var buffer = new Float32Array(size.length);
    gl.readPixels(0, 0, simRes, simRes, gl.RGBA, gl.FLOAT, buffer);
    
	return buffer;
}

function _stripComments(fnStr: string) {
	var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
	return fnStr.replace(STRIP_COMMENTS, '');
}

function _replaceReturn(fnStr: string) {
	return fnStr.replace('return ', 'gl_FragColor =');
}

function _stripWhiteSpace(fnStr: string) {
	return fnStr.replace(/\s/g, '');
}

function _getParamNames(fnStr: string): Array<string> {
	var ARGUMENT_NAMES = /([^\s,]+)/g;
	var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES)
	return result || [];
}

export function glsl(fn: Function) {
    var src = _stripWhiteSpace(_replaceReturn(_stripComments(fn.toString())));
    var param = _getParamNames(src)[0];
    src = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}') + 1);
    src = src.replace(/Math./g, '');
    src = src.replace(/var/g, 'vec4');
    var header = `
uniform sampler2D texture1;
varying vec2 vUv;
void main() {
	vec4 ${param} = texture2D(texture1, vUv);
`;
    return {
        vertex: `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}`,
        fragment: header + src
    };
}