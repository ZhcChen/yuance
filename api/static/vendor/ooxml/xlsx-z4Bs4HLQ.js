import { t as e } from "./chunk-DmhlhrBa.js";
import { At as t, B as n, Bt as r, C as i, D as a, Dt as o, E as s, Et as c, F as l, Ft as u, G as d, H as f, Ht as p, It as m, J as h, Jt as g, K as _, L as v, Lt as y, M as b, Mt as x, N as S, Nt as C, Ot as w, P as T, Pt as E, R as D, Rt as O, S as ee, T as k, Tt as A, U as j, Ut as te, V as M, W as N, Y as P, Yt as F, _ as I, _t as L, at as R, b as z, d as B, et as V, f as H, h as U, i as ne, jt as W, k as re, kt as ie, l as ae, lt as oe, m as se, mt as ce, n as le, nt as ue, o as G, p as de, q as fe, qt as K, r as pe, rt as me, t as he, ut as q, v as ge, vt as _e, w as ve, x as ye, xt as J, zt as be } from "./find-cursor-CaGrVs7z.js";
import { a as xe, i as Se, n as Ce, r as we, t as Te } from "./visible-index-CyuaF_ZP.js";
import { t as Ee } from "./mathjax-BPjQ2C_j.js";
//#region packages/core/src/sparkline/renderer.ts
function De(e, t, n) {
	let { values: r } = n;
	if (r.length === 0 || t.w <= 0 || t.h <= 0) return;
	let i = n.colorSeries ?? "#5B9BD5", a = Math.min(2, t.w * .08), o = Math.max(2, t.h * .2), s = t.x + a, c = t.y + o, l = Math.max(1, t.w - a * 2), u = Math.max(1, t.h - o * 2), d = r.filter((e) => typeof e == "number");
	if (d.length === 0) return;
	let f = Math.min(...d), p = Math.max(...d), m = n.min ?? f, h = n.max ?? p;
	m === h && (h = m + 1, --m);
	let g = h - m, _ = (e) => c + u - (e - m) / g * u;
	if (n.kind === "stem") {
		Ae(e, n, s, c, l, u);
		return;
	}
	if (n.kind === "column") {
		ke(e, n, r, s, c, l, u, m, h);
		return;
	}
	if (n.displayXAxis && m < 0 && h > 0) {
		e.save(), e.strokeStyle = n.colorAxis ?? "#000000", e.lineWidth = 1, e.beginPath();
		let t = _(0);
		e.moveTo(s, t), e.lineTo(s + l, t), e.stroke(), e.restore();
	}
	let v = r.length, y = (e) => v === 1 ? s + l / 2 : s + e / (v - 1) * l;
	e.save(), e.strokeStyle = i, e.lineCap = "round", e.lineJoin = "round", e.lineWidth = (n.lineWeight ?? .75) * x, e.beginPath();
	let b = !1, S = n.displayEmptyCellsAs ?? "gap";
	for (let t = 0; t < v; t++) {
		let n = r[t];
		if (n == null) {
			if (S === "zero") {
				let n = y(t), r = _(0);
				b ? e.lineTo(n, r) : (e.moveTo(n, r), b = !0);
			} else S === "gap" && (b = !1);
			continue;
		}
		let i = y(t), a = _(n);
		b ? e.lineTo(i, a) : (e.moveTo(i, a), b = !0);
	}
	e.stroke(), e.restore();
	let C = Math.max(1, Math.min(2.5, u * .12)), w = Oe(r, n);
	for (let t = 0; t < v; t++) {
		let a = r[t];
		if (a == null) continue;
		let o = w[t];
		(n.markers || o != null) && (e.save(), e.fillStyle = o ?? n.colorMarkers ?? i, e.beginPath(), e.arc(y(t), _(a), C, 0, Math.PI * 2), e.fill(), e.restore());
	}
}
function Oe(e, t) {
	let n = e.map(() => null), r = e.map((e) => typeof e == "number" ? e : null), i = r.findIndex((e) => e != null), a = -1;
	for (let e = r.length - 1; e >= 0; e--) if (r[e] != null) {
		a = e;
		break;
	}
	let o = r.filter((e) => e != null), s = NaN, c = NaN;
	if (o.length > 0 && (s = Math.max(...o), c = Math.min(...o)), t.negative && t.colorNegative) for (let e = 0; e < r.length; e++) {
		let i = r[e];
		i != null && i < 0 && (n[e] = t.colorNegative);
	}
	if (t.first && t.colorFirst && i >= 0 && (n[i] = t.colorFirst), t.last && t.colorLast && a >= 0 && (n[a] = t.colorLast), t.high && t.colorHigh && !Number.isNaN(s)) for (let e = 0; e < r.length; e++) r[e] === s && (n[e] = t.colorHigh);
	if (t.low && t.colorLow && !Number.isNaN(c)) for (let e = 0; e < r.length; e++) r[e] === c && (n[e] = t.colorLow);
	return n;
}
function ke(e, t, n, r, i, a, o, s, c) {
	let l = n.length;
	if (l === 0) return;
	let u = s < 0 && c > 0 ? 0 : s, d = c - s, f = (e) => i + o - (e - s) / d * o, p = f(u), m = a / l, h = Math.min(1.5, m * .15), g = Oe(n, t);
	for (let i = 0; i < l; i++) {
		let a = n[i];
		if (a == null) continue;
		let o = g[i] ?? (a < 0 && t.colorNegative ? t.colorNegative : t.colorSeries ?? "#5B9BD5"), s = f(a), c = r + m * i + h / 2, l = Math.max(1, m - h);
		e.save(), e.fillStyle = o, e.fillRect(c, Math.min(p, s), l, Math.abs(p - s)), e.restore();
	}
}
function Ae(e, t, n, r, i, a) {
	let o = t.values.length;
	if (o === 0) return;
	let s = r + a / 2, c = a / 2, l = i / o, u = Math.min(1.5, l * .15), d = Oe(t.values, t);
	for (let r = 0; r < o; r++) {
		let i = t.values[r];
		if (i == null || i === 0) continue;
		let a = i < 0, o = d[r] ?? (a && t.colorNegative ? t.colorNegative : t.colorSeries ?? "#5B9BD5"), f = n + l * r + u / 2, p = Math.max(1, l - u);
		e.save(), e.fillStyle = o, a ? e.fillRect(f, s, p, c) : e.fillRect(f, s - c, p, c), e.restore();
	}
}
//#endregion
//#region packages/core/src/text/bidi/segments.ts
function je(e, t) {
	return e === !0 ? "rtl" : e === !1 ? "ltr" : f().computeLevels(t, "auto").paragraphLevel === 1 ? "rtl" : "ltr";
}
//#endregion
//#region packages/xlsx/src/worker.ts?worker&inline
var Me = "var e=class{__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,n.unregister(this),e}free(){let e=this.__destroy_into_raw();y.__wbg_xlsxarchive_free(e,0)}extract_image(e){let t=f(e,y.__wbindgen_malloc,y.__wbindgen_realloc),n=v,r=y.xlsxarchive_extract_image(this.__wbg_ptr,t,n);if(r[3])throw p(r[2]);var a=i(r[0],r[1]).slice();return y.__wbindgen_free(r[0],r[1]*1,1),a}constructor(e,t){let r=d(e,y.__wbindgen_malloc),i=v,a=y.xlsxarchive_new(r,i,!u(t),u(t)?BigInt(0):t);if(a[2])throw p(a[1]);return this.__wbg_ptr=a[0]>>>0,n.register(this,this.__wbg_ptr,this),this}parse(){let e=y.xlsxarchive_parse(this.__wbg_ptr);if(e[3])throw p(e[2]);var t=i(e[0],e[1]).slice();return y.__wbindgen_free(e[0],e[1]*1,1),t}parse_sheet(e,t){let n=f(t,y.__wbindgen_malloc,y.__wbindgen_realloc),r=v,a=y.xlsxarchive_parse_sheet(this.__wbg_ptr,e,n,r);if(a[3])throw p(a[2]);var o=i(a[0],a[1]).slice();return y.__wbindgen_free(a[0],a[1]*1,1),o}to_markdown(){let e,t;try{let i=y.xlsxarchive_to_markdown(this.__wbg_ptr);var n=i[0],r=i[1];if(i[3])throw n=0,r=0,p(i[2]);return e=n,t=r,s(n,r)}finally{y.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(e.prototype[Symbol.dispose]=e.prototype.free);function t(){return{__proto__:null,\"./xlsx_parser_bg.js\":{__proto__:null,__wbg___wbindgen_debug_string_ab4b34d23d6778bd:function(e,t){let n=f(r(t),y.__wbindgen_malloc,y.__wbindgen_realloc),i=v;o().setInt32(e+4,i,!0),o().setInt32(e+0,n,!0)},__wbg___wbindgen_string_get_7ed5322991caaec5:function(e,t){let n=t,r=typeof n==`string`?n:void 0;var i=u(r)?0:f(r,y.__wbindgen_malloc,y.__wbindgen_realloc),a=v;o().setInt32(e+4,a,!0),o().setInt32(e+0,i,!0)},__wbg___wbindgen_throw_6b64449b9b9ed33c:function(e,t){throw Error(s(e,t))},__wbg_error_a6fa202b58aa1cd3:function(e,t){let n,r;try{n=e,r=t,console.error(s(e,t))}finally{y.__wbindgen_free(n,r,1)}},__wbg_new_227d7c05414eb861:function(){return Error()},__wbg_stack_3b0d974bbf31e44f:function(e,t){let n=t.stack,r=f(n,y.__wbindgen_malloc,y.__wbindgen_realloc),i=v;o().setInt32(e+4,i,!0),o().setInt32(e+0,r,!0)},__wbindgen_cast_0000000000000001:function(e,t){return s(e,t)},__wbindgen_init_externref_table:function(){let e=y.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}const n=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>y.__wbg_xlsxarchive_free(e>>>0,1));function r(e){let t=typeof e;if(t==`number`||t==`boolean`||e==null)return`${e}`;if(t==`string`)return`\"${e}\"`;if(t==`symbol`){let t=e.description;return t==null?`Symbol`:`Symbol(${t})`}if(t==`function`){let t=e.name;return typeof t==`string`&&t.length>0?`Function(${t})`:`Function`}if(Array.isArray(e)){let t=e.length,n=`[`;t>0&&(n+=r(e[0]));for(let i=1;i<t;i++)n+=`, `+r(e[i]);return n+=`]`,n}let n=/\\[object ([^\\]]+)\\]/.exec(toString.call(e)),i;if(n&&n.length>1)i=n[1];else return toString.call(e);if(i==`Object`)try{return`Object(`+JSON.stringify(e)+`)`}catch{return`Object`}return e instanceof Error?`${e.name}: ${e.message}\\n${e.stack}`:i}function i(e,t){return e>>>=0,l().subarray(e/1,e/1+t)}let a=null;function o(){return(a===null||a.buffer.detached===!0||a.buffer.detached===void 0&&a.buffer!==y.memory.buffer)&&(a=new DataView(y.memory.buffer)),a}function s(e,t){return e>>>=0,g(e,t)}let c=null;function l(){return(c===null||c.byteLength===0)&&(c=new Uint8Array(y.memory.buffer)),c}function u(e){return e==null}function d(e,t){let n=t(e.length*1,1)>>>0;return l().set(e,n/1),v=e.length,n}function f(e,t,n){if(n===void 0){let n=_.encode(e),r=t(n.length,1)>>>0;return l().subarray(r,r+n.length).set(n),v=n.length,r}let r=e.length,i=t(r,1)>>>0,a=l(),o=0;for(;o<r;o++){let t=e.charCodeAt(o);if(t>127)break;a[i+o]=t}if(o!==r){o!==0&&(e=e.slice(o)),i=n(i,r,r=o+e.length*3,1)>>>0;let t=l().subarray(i+o,i+r),a=_.encodeInto(e,t);o+=a.written,i=n(i,r,o,1)>>>0}return v=o,i}function p(e){let t=y.__wbindgen_externrefs.get(e);return y.__externref_table_dealloc(e),t}let m=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0});m.decode();let h=0;function g(e,t){return h+=t,h>=2146435072&&(m=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0}),m.decode(),h=t),m.decode(l().subarray(e,e+t))}const _=new TextEncoder;`encodeInto`in _||(_.encodeInto=function(e,t){let n=_.encode(e);return t.set(n),{read:e.length,written:n.length}});let v=0,y;function b(e,t){return y=e.exports,a=null,c=null,y.__wbindgen_start(),y}async function x(e,t){if(typeof Response==`function`&&e instanceof Response){if(typeof WebAssembly.instantiateStreaming==`function`)try{return await WebAssembly.instantiateStreaming(e,t)}catch(t){if(e.ok&&n(e.type)&&e.headers.get(`Content-Type`)!==`application/wasm`)console.warn(\"`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\\n\",t);else throw t}let r=await e.arrayBuffer();return await WebAssembly.instantiate(r,t)}else{let n=await WebAssembly.instantiate(e,t);return n instanceof WebAssembly.Instance?{instance:n,module:e}:n}function n(e){switch(e){case`basic`:case`cors`:case`default`:return!0}return!1}}async function S(e){if(y!==void 0)return y;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn(`using deprecated parameters for the initialization function; pass a single object instead`));let n=t();(typeof e==`string`||typeof Request==`function`&&e instanceof Request||typeof URL==`function`&&e instanceof URL)&&(e=fetch(e));let{instance:r,module:i}=await x(await e,n);return b(r,i)}async function C(e){return y=void 0,a=null,c=null,S(e)}function w(e){if(!e.startsWith(`data:`))return null;let t=e.indexOf(`,`);if(t===-1)return null;let n=atob(e.slice(t+1)),r=new Uint8Array(n.length);for(let e=0;e<n.length;e++)r[e]=n.charCodeAt(e);return r.buffer}var T=class e extends Error{code=`parser-crashed`;constructor(t){super(t),this.name=`WasmTrapError`,Object.setPrototypeOf(this,e.prototype)}};function E(e){let t=globalThis.WebAssembly?.RuntimeError;if(t&&e instanceof t||e instanceof RangeError)return!0;if(e instanceof Error){let t=e.name;if(t===`RuntimeError`||t===`CompileError`||t===`LinkError`)return!0}return!1}const D=new class{_init;_opts;_wasmInput=null;_initPromise=null;_poisoned=!1;_archive=null;constructor(e,t={}){this._init=e,this._opts=t}setWasmUrl(e){this._wasmInput=e,this._poisoned=!1,this._initPromise=this._init(e)}get archive(){return this._archive}setArchive(e){this._freeArchive(),this._archive=e}disposeArchive(){this._freeArchive()}_freeArchive(){this._archive!=null&&this._opts.freeArchive&&this._opts.freeArchive(this._archive),this._archive=null}get poisoned(){return this._poisoned}async ensureReady(){if(this._poisoned){if(this._wasmInput===null)throw Error(`WasmParserHost: setWasmUrl was never called`);let e=(this._opts.reinit??this._init)(this._wasmInput);this._initPromise=e,await e,this._poisoned=!1;return}if(this._initPromise===null)throw Error(`WasmParserHost: setWasmUrl was never called`);await this._initPromise}run(e){try{return e()}catch(e){throw E(e)?(this._poison(),new T(`WASM parser trapped and was recycled: ${e instanceof Error?e.message:String(e)}`)):e}}poison(){this._poison()}_poison(){if(this._poisoned=!0,this._initPromise=null,this._archive!=null&&this._opts.freeArchive)try{this._opts.freeArchive(this._archive)}catch{}this._archive=null}}(S,{freeArchive:e=>e.free(),reinit:C});self.onmessage=async t=>{let n=t.data;if(n.type===`init`){D.setWasmUrl(w(n.wasmUrl)??n.wasmUrl);return}let r=n.id;try{if(await D.ensureReady(),n.type===`parse`){let t=typeof n.maxZipEntryBytes==`number`&&n.maxZipEntryBytes>0?BigInt(n.maxZipEntryBytes):void 0,i=new Uint8Array(n.data),a=D.run(()=>{let n=new e(i,t);return D.setArchive(n),n.parse()}).buffer,o={type:`parsed`,id:r,workbookJson:a};self.postMessage(o,[a]);return}let t=D.archive;if(n.type===`parseSheet`){if(!t)throw Error(`parseSheet before parse: no archive retained`);let e=D.run(()=>t.parse_sheet(n.sheetIndex,n.sheetName)).buffer,i={type:`parsedSheet`,id:r,worksheetJson:e};self.postMessage(i,[e]);return}if(n.type===`extractImage`){if(!t)throw Error(`No xlsx loaded`);let e=D.run(()=>t.extract_image(n.path).buffer),i={type:`imageExtracted`,id:r,bytes:e};self.postMessage(i,[e]);return}if(n.type===`toMarkdown`){if(!t)throw Error(`No xlsx loaded`);let e={type:`markdownRendered`,id:r,markdown:D.run(()=>t.to_markdown())};self.postMessage(e);return}}catch(e){let t={type:`error`,id:r,message:String(e)};self.postMessage(t)}};", Ne = typeof self < "u" && self.Blob && new Blob(["URL.revokeObjectURL(import.meta.url);", Me], { type: "text/javascript;charset=utf-8" });
function Pe(e) {
	let t;
	try {
		if (t = Ne && (self.URL || self.webkitURL).createObjectURL(Ne), !t) throw "";
		let n = new Worker(t, {
			type: "module",
			name: e?.name
		});
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(Me), {
			type: "module",
			name: e?.name
		});
	}
}
//#endregion
//#region packages/xlsx/src/wasm/xlsx_parser_bg.wasm?url
var Fe = new URL("xlsx_parser_bg.wasm", import.meta.url).href;
//#endregion
//#region packages/xlsx/src/sheet-visibility.ts
function Ie(e, t) {
	return !Number.isInteger(t) || t < 0 || t >= e.length ? "visible" : e[t].visibility ?? "visible";
}
//#endregion
//#region packages/xlsx/src/phonetic.ts
function Le(e) {
	return Array.from(e);
}
function Re(e, t, n, r, i) {
	let a = Le(t), o = a.length, s = [];
	for (let t of e) {
		let e = t.sb, c = t.eb;
		if (!(e < c) || e >= o) continue;
		let l = Math.min(c, o), u = n + i(a.slice(0, e).join("")), d = i(a.slice(e, l).join("")), f = r === "center" ? "center" : r === "distributed" ? "distribute" : "start";
		s.push({
			text: t.text,
			x: u,
			width: d,
			spread: f
		});
	}
	return s;
}
//#endregion
//#region packages/xlsx/src/formula.ts
function Y(e) {
	return Array.isArray(e) ? e : [e];
}
function ze(e) {
	return Array.isArray(e) ? e[0] ?? 0 : e;
}
var Be = 8;
function Ve(e, t) {
	try {
		return He(Ye(e, t));
	} catch {
		return !1;
	}
}
function He(e) {
	let t = ze(e);
	return typeof t == "boolean" ? t : typeof t == "number" ? t !== 0 : typeof t == "string" ? t.length > 0 && t.toUpperCase() !== "FALSE" : !1;
}
function X(e) {
	let t = ze(e);
	if (typeof t == "number") return t;
	if (typeof t == "boolean") return +!!t;
	if (t == null) return 0;
	let n = parseFloat(String(t));
	return isNaN(n) ? 0 : n;
}
function Ue(e) {
	let t = ze(e);
	return t == null ? "" : typeof t == "boolean" ? t ? "TRUE" : "FALSE" : String(t);
}
var We = new Set([
	"<",
	">",
	"=",
	"+",
	"-",
	"*",
	"/",
	"&",
	"^",
	"%"
]);
function Ge(e) {
	let t = [], n = 0, r = e;
	for (; n < r.length;) {
		let e = r[n];
		if (e === " " || e === "	" || e === "\n" || e === "\r") {
			n++;
			continue;
		}
		if (e === "(") {
			t.push({
				kind: "lparen",
				text: e
			}), n++;
			continue;
		}
		if (e === ")") {
			t.push({
				kind: "rparen",
				text: e
			}), n++;
			continue;
		}
		if (e === ",") {
			t.push({
				kind: "comma",
				text: e
			}), n++;
			continue;
		}
		if (e === ":") {
			t.push({
				kind: "colon",
				text: e
			}), n++;
			continue;
		}
		if (e === "\"") {
			let e = n + 1, i = "";
			for (; e < r.length;) {
				if (r[e] === "\"" && r[e + 1] === "\"") {
					i += "\"", e += 2;
					continue;
				}
				if (r[e] === "\"") break;
				i += r[e], e++;
			}
			t.push({
				kind: "str",
				text: i
			}), n = e + 1;
			continue;
		}
		if (e >= "0" && e <= "9") {
			let e = n;
			for (; e < r.length && (r[e] >= "0" && r[e] <= "9" || r[e] === ".");) e++;
			t.push({
				kind: "num",
				text: r.slice(n, e)
			}), n = e;
			continue;
		}
		if (We.has(e)) {
			(e === "<" || e === ">") && (r[n + 1] === "=" || e === "<" && r[n + 1] === ">") ? (t.push({
				kind: "op",
				text: r.slice(n, n + 2)
			}), n += 2) : (t.push({
				kind: "op",
				text: e
			}), n++);
			continue;
		}
		if (e === "$" || Ke(e)) {
			let e = n;
			for (; e < r.length && (r[e] === "$" || qe(r[e]));) e++;
			let i = r.slice(n, e);
			n = e;
			let a = Je(i);
			if (a) t.push({
				kind: "ref",
				text: i,
				ref: a
			});
			else {
				let e = i.toUpperCase();
				e === "TRUE" || e === "FALSE" ? t.push({
					kind: "bool",
					text: e
				}) : t.push({
					kind: "name",
					text: i
				});
			}
			continue;
		}
		n++;
	}
	return t;
}
function Ke(e) {
	return e >= "A" && e <= "Z" || e >= "a" && e <= "z" || e === "_";
}
function qe(e) {
	return Ke(e) || e >= "0" && e <= "9" || e === ".";
}
function Je(e) {
	let t = 0, n = !1, r = !1;
	e[t] === "$" && (n = !0, t++);
	let i = t;
	for (; t < e.length && e[t] >= "A" && e[t].toUpperCase() <= "Z" && !(!(e[t] >= "A" && e[t] <= "Z") && !(e[t] >= "a" && e[t] <= "z"));) t++;
	if (t === i) return null;
	let a = e.slice(i, t).toUpperCase();
	e[t] === "$" && (r = !0, t++);
	let o = t;
	for (; t < e.length && e[t] >= "0" && e[t] <= "9";) t++;
	if (t === o || t !== e.length) return null;
	let s = parseInt(e.slice(o, t), 10), c = 0;
	for (let e = 0; e < a.length; e++) c = c * 26 + (a.charCodeAt(e) - 64);
	return {
		colAbs: n,
		col: c,
		rowAbs: r,
		row: s
	};
}
function Ye(e, t) {
	return Qe({
		toks: Ge(e),
		pos: 0
	}, t);
}
function Xe(e) {
	return e.toks[e.pos];
}
function Ze(e) {
	return e.toks[e.pos++];
}
function Qe(e, t) {
	return $e(e, t);
}
function $e(e, t) {
	let n = et(e, t), r = Xe(e);
	if (r && r.kind === "op" && (r.text === "<" || r.text === ">" || r.text === "<=" || r.text === ">=" || r.text === "=" || r.text === "<>")) {
		Ze(e);
		let i = et(e, t);
		return tt(r.text, n, i);
	}
	return n;
}
function et(e, t) {
	let n = nt(e, t);
	for (;;) {
		let r = Xe(e);
		if (!r || r.kind !== "op" || r.text !== "&") break;
		Ze(e);
		let i = nt(e, t);
		n = Ue(n) + Ue(i);
	}
	return n;
}
function tt(e, t, n) {
	let r = typeof t == "string" && isNaN(parseFloat(t)) ? null : X(t), i = typeof n == "string" && isNaN(parseFloat(n)) ? null : X(n);
	if (r !== null && i !== null) switch (e) {
		case "<": return r < i;
		case ">": return r > i;
		case "<=": return r <= i;
		case ">=": return r >= i;
		case "=": return r === i;
		case "<>": return r !== i;
	}
	let a = String(t ?? ""), o = String(n ?? "");
	switch (e) {
		case "<": return a < o;
		case ">": return a > o;
		case "<=": return a <= o;
		case ">=": return a >= o;
		case "=": return a === o;
		case "<>": return a !== o;
	}
	return !1;
}
function nt(e, t) {
	let n = rt(e, t);
	for (;;) {
		let r = Xe(e);
		if (!r || r.kind !== "op" || r.text !== "+" && r.text !== "-") break;
		Ze(e);
		let i = rt(e, t);
		n = r.text === "+" ? X(n) + X(i) : X(n) - X(i);
	}
	return n;
}
function rt(e, t) {
	let n = it(e, t);
	for (;;) {
		let r = Xe(e);
		if (!r || r.kind !== "op" || r.text !== "*" && r.text !== "/") break;
		Ze(e);
		let i = it(e, t);
		if (r.text === "*") n = X(n) * X(i);
		else {
			let e = X(i);
			n = e === 0 ? 0 : X(n) / e;
		}
	}
	return n;
}
function it(e, t) {
	let n = Xe(e);
	return n && n.kind === "op" && n.text === "-" ? (Ze(e), -X(it(e, t))) : n && n.kind === "op" && n.text === "+" ? (Ze(e), X(it(e, t))) : at(e, t);
}
function at(e, t) {
	let n = Ze(e);
	if (!n) return 0;
	if (n.kind === "num") return parseFloat(n.text);
	if (n.kind === "str") return n.text;
	if (n.kind === "bool") return n.text === "TRUE";
	if (n.kind === "lparen") {
		let n = Qe(e, t), r = Ze(e);
		if (!r || r.kind !== "rparen") throw Error("missing )");
		return n;
	}
	if (n.kind === "ref") {
		if (Xe(e)?.kind === "colon") {
			Ze(e);
			let r = Ze(e);
			if (r?.kind !== "ref" || !r.ref) throw Error("range: expected ref after :");
			return ct(n.ref, r.ref, t);
		}
		return st(n.ref, t);
	}
	if (n.kind === "name") {
		if (Xe(e)?.kind === "lparen") {
			Ze(e);
			let r = [];
			if (Xe(e)?.kind !== "rparen") for (r.push(Qe(e, t)); Xe(e)?.kind === "comma";) Ze(e), r.push(Qe(e, t));
			let i = Ze(e);
			if (!i || i.kind !== "rparen") throw Error("missing )");
			return ut(n.text, r, t);
		}
		let r = t.definedNames.get(n.text);
		return r && t.depth < Be ? Ye(ot(r.formula), {
			...t,
			anchorRow: 1,
			anchorCol: 1,
			depth: t.depth + 1
		}) : 0;
	}
	return 0;
}
function ot(e) {
	let t = e.match(/^(?:'[^']*'|[A-Za-z_][A-Za-z0-9_.]*)!(.*)$/);
	return t ? t[1] : e;
}
function st(e, t) {
	let n = e.colAbs ? e.col : e.col + (t.col - t.anchorCol), r = e.rowAbs ? e.row : e.row + (t.row - t.anchorRow);
	return lt(t.cellIndex.get(`${r}:${n}`));
}
function ct(e, t, n) {
	let r = e.colAbs ? e.col : e.col + (n.col - n.anchorCol), i = e.rowAbs ? e.row : e.row + (n.row - n.anchorRow), a = t.colAbs ? t.col : t.col + (n.col - n.anchorCol), o = t.rowAbs ? t.row : t.row + (n.row - n.anchorRow), s = Math.min(r, a), c = Math.max(r, a), l = Math.min(i, o), u = Math.max(i, o), d = [], f = 4096;
	for (let e = l; e <= u && d.length < f; e++) for (let t = s; t <= c && d.length < f; t++) d.push(lt(n.cellIndex.get(`${e}:${t}`)));
	return d;
}
function lt(e) {
	if (!e) return null;
	switch (e.value.type) {
		case "number": return e.value.number;
		case "bool": return e.value.bool;
		case "text": return e.value.text;
		case "error": return null;
		default: return null;
	}
}
function ut(e, t, n) {
	switch (e.toUpperCase()) {
		case "AND": return t.flatMap(Y).every((e) => He(e));
		case "OR": return t.flatMap(Y).some((e) => He(e));
		case "NOT": return !He(t[0]);
		case "IF": return He(t[0]) ? t[1] ?? !0 : t[2] ?? !1;
		case "IFERROR": return t[0] == null ? t[1] ?? 0 : t[0];
		case "IFS":
			for (let e = 0; e + 1 < t.length; e += 2) if (He(t[e])) return t[e + 1];
			return null;
		case "TRUE": return !0;
		case "FALSE": return !1;
		case "ISBLANK": {
			let e = ze(t[0]);
			return e == null || e === "";
		}
		case "ISNUMBER": return typeof ze(t[0]) == "number";
		case "ISTEXT": return typeof ze(t[0]) == "string";
		case "ISNONTEXT": return typeof ze(t[0]) != "string";
		case "ISERROR":
		case "ISERR":
		case "ISNA": return ze(t[0]) == null;
		case "ISLOGICAL": return typeof ze(t[0]) == "boolean";
		case "ROUNDDOWN": {
			let e = X(t[0]), n = 10 ** X(t[1]);
			return (e >= 0 ? Math.floor(e * n) : Math.ceil(e * n)) / n;
		}
		case "ROUNDUP": {
			let e = X(t[0]), n = 10 ** X(t[1]);
			return (e >= 0 ? Math.ceil(e * n) : Math.floor(e * n)) / n;
		}
		case "ROUND": {
			let e = X(t[0]), n = 10 ** X(t[1]);
			return Math.round(e * n) / n;
		}
		case "INT": return Math.floor(X(t[0]));
		case "TRUNC": {
			let e = X(t[0]), n = 10 ** X(t[1] ?? 0);
			return (e >= 0 ? Math.floor(e * n) : Math.ceil(e * n)) / n;
		}
		case "CEILING": {
			let e = X(t[0]), n = X(t[1] ?? 1);
			return n === 0 ? 0 : Math.ceil(e / n) * n;
		}
		case "FLOOR": {
			let e = X(t[0]), n = X(t[1] ?? 1);
			return n === 0 ? 0 : Math.floor(e / n) * n;
		}
		case "MOD": {
			let e = X(t[0]), n = X(t[1]);
			return n === 0 ? null : e - Math.floor(e / n) * n;
		}
		case "POWER": return X(t[0]) ** +X(t[1]);
		case "SQRT": {
			let e = X(t[0]);
			return e < 0 ? null : Math.sqrt(e);
		}
		case "ABS": return Math.abs(X(t[0]));
		case "SIGN": {
			let e = X(t[0]);
			return e > 0 ? 1 : e < 0 ? -1 : 0;
		}
		case "EXP": return Math.exp(X(t[0]));
		case "LN": {
			let e = X(t[0]);
			return e <= 0 ? null : Math.log(e);
		}
		case "LOG10": {
			let e = X(t[0]);
			return e <= 0 ? null : Math.log10(e);
		}
		case "MIN": {
			let e = t.flatMap(Y).filter((e) => typeof e == "number");
			return e.length ? Math.min(...e) : 0;
		}
		case "MAX": {
			let e = t.flatMap(Y).filter((e) => typeof e == "number");
			return e.length ? Math.max(...e) : 0;
		}
		case "SUM": return t.flatMap(Y).reduce((e, t) => e + (typeof t == "number" ? t : 0), 0);
		case "AVERAGE": {
			let e = t.flatMap(Y).filter((e) => typeof e == "number");
			return e.length ? e.reduce((e, t) => e + t, 0) / e.length : null;
		}
		case "COUNT": return t.flatMap(Y).filter((e) => typeof e == "number").length;
		case "COUNTA": return t.flatMap(Y).filter((e) => e != null && e !== "").length;
		case "COUNTBLANK": return t.flatMap(Y).filter((e) => e == null || e === "").length;
		case "COUNTIF": return dt(Y(t[0]), t[1]);
		case "SUMIF": return ft(Y(t[0]), t[1], t[2] === void 0 ? null : Y(t[2]));
		case "AVERAGEIF": {
			let e = Y(t[0]), n = ft(e, t[1], t[2] === void 0 ? null : Y(t[2])), r = dt(e, t[1]);
			return r === 0 ? null : X(n) / r;
		}
		case "LEN": return Ue(t[0]).length;
		case "LEFT": return Ue(t[0]).slice(0, Math.max(0, X(t[1] ?? 1)));
		case "RIGHT": {
			let e = Ue(t[0]), n = Math.max(0, X(t[1] ?? 1));
			return n >= e.length ? e : e.slice(e.length - n);
		}
		case "MID": {
			let e = Ue(t[0]), n = Math.max(1, X(t[1])) - 1, r = Math.max(0, X(t[2]));
			return e.slice(n, n + r);
		}
		case "UPPER": return Ue(t[0]).toUpperCase();
		case "LOWER": return Ue(t[0]).toLowerCase();
		case "TRIM": return Ue(t[0]).replace(/\s+/g, " ").trim();
		case "EXACT": return Ue(t[0]) === Ue(t[1]);
		case "FIND": {
			let e = Ue(t[0]), n = Ue(t[1]), r = Math.max(1, X(t[2] ?? 1)) - 1, i = n.indexOf(e, r);
			return i < 0 ? null : i + 1;
		}
		case "SEARCH": {
			let e = Ue(t[0]).toLowerCase(), n = Ue(t[1]).toLowerCase(), r = Math.max(1, X(t[2] ?? 1)) - 1, i = n.indexOf(e, r);
			return i < 0 ? null : i + 1;
		}
		case "CONCATENATE":
		case "CONCAT": return t.flatMap(Y).map((e) => e == null ? "" : typeof e == "boolean" ? e ? "TRUE" : "FALSE" : String(e)).join("");
		case "T": {
			let e = ze(t[0]);
			return typeof e == "string" ? e : "";
		}
		case "N": {
			let e = ze(t[0]);
			return typeof e == "number" ? e : typeof e == "boolean" ? +!!e : 0;
		}
		case "VALUE": return X(t[0]);
		case "ROW": return n.row;
		case "COLUMN": return n.col;
		case "TODAY": return mt();
		case "NOW": return ht();
		case "DATE": return gt(X(t[0]), X(t[1]), X(t[2]));
		case "YEAR": return vt(X(t[0])).y;
		case "MONTH": return vt(X(t[0])).m;
		case "DAY": return vt(X(t[0])).d;
		case "WEEKDAY": {
			let e = _t(X(t[0])).getUTCDay(), n = X(t[1] ?? 1);
			return n === 2 ? e === 0 ? 7 : e : n === 3 ? e === 0 ? 6 : e - 1 : e + 1;
		}
		default: return 0;
	}
}
function dt(e, t) {
	let n = pt(t), r = 0;
	for (let t of e) n(t) && r++;
	return r;
}
function ft(e, t, n) {
	let r = pt(t), i = n ?? e, a = 0;
	for (let t = 0; t < e.length; t++) if (r(e[t])) {
		let e = i[t];
		typeof e == "number" && (a += e);
	}
	return a;
}
function pt(e) {
	let t = ze(e);
	if (typeof t != "string") {
		let e = typeof t == "number" ? t : null;
		return (n) => e !== null && typeof n == "number" ? n === e : n === t;
	}
	let n = t.match(/^(<=|>=|<>|<|>|=)(.*)$/), r = n ? n[1] : "=", i = n ? n[2] : t, a = i.trim() === "" ? NaN : parseFloat(i), o = !isNaN(a) && /^-?\d+(\.\d+)?$/.test(i.trim());
	return (e) => {
		if (o && typeof e == "number") switch (r) {
			case "<": return e < a;
			case ">": return e > a;
			case "<=": return e <= a;
			case ">=": return e >= a;
			case "<>": return e !== a;
			default: return e === a;
		}
		let t = e == null ? "" : typeof e == "boolean" ? e ? "TRUE" : "FALSE" : String(e);
		switch (r) {
			case "<>": return t !== i;
			case "<": return t < i;
			case ">": return t > i;
			case "<=": return t <= i;
			case ">=": return t >= i;
			default: return t === i;
		}
	};
}
function mt() {
	let e = /* @__PURE__ */ new Date();
	return ie(new Date(Date.UTC(e.getFullYear(), e.getMonth(), e.getDate())), !1);
}
function ht() {
	return ie(new Date(Date.now()), !1);
}
function gt(e, t, n) {
	return Math.floor(ie(new Date(Date.UTC(e, t - 1, n)), !1));
}
function _t(e) {
	return w(Math.floor(e), !1);
}
function vt(e) {
	let t = _t(e);
	return {
		y: t.getUTCFullYear(),
		m: t.getUTCMonth() + 1,
		d: t.getUTCDate()
	};
}
//#endregion
//#region packages/xlsx/src/number-format.ts
function yt(e) {
	switch (e.type) {
		case "empty": return "";
		case "text": return e.text;
		case "number": return String(e.number);
		case "bool": return e.bool ? "TRUE" : "FALSE";
		case "error": return e.error;
		case "shared": return "";
	}
}
function bt(e, t, n, r = !1) {
	return xt(e, t, n, r).text;
}
function xt(e, t, n, r = !1) {
	let i = t.cellXfs[e.styleIndex ?? 0]?.numFmtId ?? 0, a = t.numFmts?.find((e) => e.numFmtId === i)?.formatCode ?? null, o = n?.numFmtId ?? i, s = n?.formatCode ?? a;
	if (e.value.type !== "number") {
		let t = yt(e.value);
		return { text: s ? St(t, s) : t };
	}
	let c = Ct(e.formula);
	return zt(c ?? e.value.number, o, s, c === null ? r : !1);
}
function St(e, t) {
	let n = Ht(t), r;
	if (n.length >= 4) r = n[3];
	else {
		let t = n[n.length - 1];
		if (!t.includes("@")) return e;
		r = t;
	}
	if (r === "") return "";
	let i = "", a = 0;
	for (; a < r.length;) {
		let t = r[a];
		if (t === "\"") {
			for (a++; a < r.length && r[a] !== "\"";) i += r[a++];
			a < r.length && a++;
		} else if (t === "\\") a + 1 < r.length && (i += r[a + 1]), a += 2;
		else if (t === "[") {
			for (; a < r.length && r[a] !== "]";) a++;
			a < r.length && a++;
		} else t === "@" ? (i += e, a++) : t === "_" || t === "*" ? a += 2 : (i += t, a++);
	}
	return i;
}
function Ct(e) {
	if (!e) return null;
	let t = e.trim().replace(/^=/, "").toUpperCase().replace(/\s+/g, "");
	return t === "TODAY()" ? mt() : t === "NOW()" ? ht() : null;
}
var wt = {
	14: "m/d/yyyy",
	15: "d-mmm-yy",
	16: "d-mmm",
	17: "mmm-yy",
	18: "h:mm AM/PM",
	19: "h:mm:ss AM/PM",
	20: "h:mm",
	21: "h:mm:ss",
	22: "m/d/yyyy h:mm",
	27: "[$-411]ge.m.d",
	28: "[$-411]ggge\"年\"m\"月\"d\"日\"",
	29: "[$-411]ggge\"年\"m\"月\"d\"日\"",
	30: "m/d/yy",
	31: "yyyy\"年\"m\"月\"d\"日\"",
	50: "[$-411]ge.m.d",
	51: "[$-411]ggge\"年\"m\"月\"d\"日\"",
	52: "yyyy\"年\"m\"月\"",
	53: "m\"月\"d\"日\"",
	54: "[$-411]ggge\"年\"m\"月\"d\"日\"",
	55: "yyyy\"年\"m\"月\"",
	56: "m\"月\"d\"日\"",
	57: "[$-411]ge.m.d",
	58: "[$-411]ggge\"年\"m\"月\"d\"日\""
}, Tt = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December"
], Et = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday"
], Dt = [
	"日",
	"月",
	"火",
	"水",
	"木",
	"金",
	"土"
], Ot = [
	"日曜日",
	"月曜日",
	"火曜日",
	"水曜日",
	"木曜日",
	"金曜日",
	"土曜日"
], kt = [
	{
		start: new Date(Date.UTC(2019, 4, 1)),
		abbr: "R",
		short: "令",
		long: "令和"
	},
	{
		start: new Date(Date.UTC(1989, 0, 8)),
		abbr: "H",
		short: "平",
		long: "平成"
	},
	{
		start: new Date(Date.UTC(1926, 11, 25)),
		abbr: "S",
		short: "昭",
		long: "昭和"
	},
	{
		start: new Date(Date.UTC(1912, 6, 30)),
		abbr: "T",
		short: "大",
		long: "大正"
	},
	{
		start: new Date(Date.UTC(1868, 0, 25)),
		abbr: "M",
		short: "明",
		long: "明治"
	}
];
function At(e) {
	for (let t of kt) if (e.getTime() >= t.start.getTime()) return {
		abbr: t.abbr,
		short: t.short,
		long: t.long,
		year: e.getUTCFullYear() - t.start.getUTCFullYear() + 1
	};
	let t = kt[kt.length - 1];
	return {
		abbr: t.abbr,
		short: t.short,
		long: t.long,
		year: e.getUTCFullYear()
	};
}
function jt(e, t, n = !1) {
	let r = w(e, n), i = r.getUTCFullYear(), a = r.getUTCMonth() + 1, o = r.getUTCDate(), s = r.getUTCDay(), c = r.getUTCHours(), l = r.getUTCMinutes(), u = r.getUTCSeconds(), d = t.split(";")[0], f = /am\/pm|a\/p/i.test(d), p = null, m = () => p ??= At(r), h = "", g = 0, _ = !1;
	for (; g < d.length;) {
		let t = d[g];
		if (t === "\"") {
			for (g++; g < d.length && d[g] !== "\"";) h += d[g++];
			g < d.length && g++, _ = !1;
		} else if (t === "[") {
			let t = d.indexOf("]", g), n = t > g ? d.slice(g + 1, t) : "", r = n.match(/^([hms])\1*$/i);
			if (r) {
				let i = r[1].toLowerCase(), a = e < 0 ? "-" : "", o = Math.floor(Math.abs(e) * 86400), s;
				s = i === "h" ? Math.floor(o / 3600) : i === "m" ? Math.floor(o / 60) : o;
				let c = n.length >= 2 ? String(s).padStart(n.length, "0") : String(s);
				h += a + c, g = t + 1, _ = i === "h";
			} else {
				for (; g < d.length && d[g] !== "]";) g++;
				g < d.length && g++;
			}
		} else if (t === "_") g += 2;
		else if (t === "*") g += 2;
		else if (t === "\\") g + 1 < d.length && (h += d[g + 1]), g += 2, _ = !1;
		else if (t === "y" || t === "Y") {
			let e = 0;
			for (; g < d.length && d[g].toLowerCase() === "y";) e++, g++;
			h += e <= 2 ? String(i).slice(-2) : String(i).padStart(4, "0"), _ = !1;
		} else if (t === "m" || t === "M") {
			let e = 0;
			for (; g < d.length && d[g].toLowerCase() === "m";) e++, g++;
			let t = d.slice(g).replace(/\[[^\]]*\]/g, "");
			_ || /^:s/i.test(t) ? h += e >= 2 ? String(l).padStart(2, "0") : String(l) : e === 1 ? h += String(a) : e === 2 ? h += String(a).padStart(2, "0") : e === 3 ? h += Tt[a - 1].slice(0, 3) : e === 4 ? h += Tt[a - 1] : h += Tt[a - 1][0], _ = !1;
		} else if (t === "d" || t === "D") {
			let e = 0;
			for (; g < d.length && d[g].toLowerCase() === "d";) e++, g++;
			e === 1 ? h += String(o) : e === 2 ? h += String(o).padStart(2, "0") : e === 3 ? h += Et[s].slice(0, 3) : h += Et[s], _ = !1;
		} else if (t === "h" || t === "H") {
			let e = 0;
			for (; g < d.length && d[g].toLowerCase() === "h";) e++, g++;
			let t = f ? c % 12 || 12 : c;
			h += e >= 2 ? String(t).padStart(2, "0") : String(t), _ = !0;
		} else if (t === "s" || t === "S") {
			let e = 0;
			for (; g < d.length && d[g].toLowerCase() === "s";) e++, g++;
			h += e >= 2 ? String(u).padStart(2, "0") : String(u), _ = !1;
		} else if (t === "g" || t === "G") {
			let e = 0;
			for (; g < d.length && d[g].toLowerCase() === "g";) e++, g++;
			let t = m();
			e === 1 ? h += t.abbr : e === 2 ? h += t.short : h += t.long, _ = !1;
		} else if (t === "e" || t === "E") {
			let e = 0;
			for (; g < d.length && d[g].toLowerCase() === "e";) e++, g++;
			let t = m().year;
			h += e >= 2 ? String(t).padStart(2, "0") : String(t), _ = !1;
		} else if (t === "r" || t === "R") {
			let e = 0;
			for (; g < d.length && d[g].toLowerCase() === "r";) e++, g++;
			let t = m().year;
			h += e >= 2 ? String(t).padStart(2, "0") : String(t), _ = !1;
		} else if (t === "A" || t === "a") {
			let e = d.slice(g).toUpperCase();
			e.startsWith("AAAA") ? (h += Ot[s], g += 4) : e.startsWith("AAA") ? (h += Dt[s], g += 3) : e.startsWith("AM/PM") ? (h += c < 12 ? "AM" : "PM", g += 5) : e.startsWith("A/P") ? (h += c < 12 ? "A" : "P", g += 3) : (h += t, g++), _ = !1;
		} else h += t, g++, t !== ":" && t !== "/" && t !== "-" && t !== "." && t !== " " && (_ = !1);
	}
	return h;
}
function Mt(e) {
	if (/\[[hms]+\]/i.test(e)) return !0;
	let t = e.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
	return /[yd]/i.test(t) || /a{3,}/i.test(t);
}
var Nt = 11, Pt = 6;
function Ft(e) {
	return e.includes(".") ? e.replace(/0+$/, "").replace(/\.$/, "") : e;
}
function It(e) {
	return `${e >= 0 ? "+" : "-"}${Math.abs(e).toString().padStart(2, "0")}`;
}
function Lt(e) {
	let [t, n] = e.toExponential(Pt - 1).split("e");
	return `${Ft(t)}E${It(Number(n))}`;
}
function Rt(e) {
	if (!Number.isFinite(e)) return String(e);
	if (e === 0) return "0";
	let t = e < 0, n = Math.abs(e), r = Number(n.toExponential(Nt - 1).split("e")[1]), i = r >= Nt || r < -5 ? Lt(n) : Ft(n.toPrecision(Nt));
	return t ? `-${i}` : i;
}
function zt(e, t, n, r = !1) {
	let i = wt[t];
	if (i) return { text: jt(e, i, r) };
	if (n && n.trim().toLowerCase() === "general") return { text: Rt(e) };
	if (n) return Mt(n) ? { text: jt(e, n, r) } : Qt(e, n);
	switch (t) {
		case 0: return { text: Rt(e) };
		case 1: return Qt(e, "0");
		case 2: return Qt(e, "0.00");
		case 3: return Qt(e, "#,##0");
		case 4: return Qt(e, "#,##0.00");
		case 9: return Qt(e, "0%");
		case 10: return Qt(e, "0.00%");
		case 11: return Qt(e, "0.00E+00");
		case 37: return Qt(e, "#,##0 ;(#,##0)");
		case 38: return Qt(e, "#,##0 ;[Red](#,##0)");
		case 39: return Qt(e, "#,##0.00;(#,##0.00)");
		case 40: return Qt(e, "#,##0.00;[Red](#,##0.00)");
		case 48: return Qt(e, "##0.0E+0");
		case 49: return { text: String(e) };
		default: return { text: Rt(e) };
	}
}
var Bt = {
	black: "#000000",
	blue: "#0000FF",
	cyan: "#00FFFF",
	green: "#008000",
	magenta: "#FF00FF",
	red: "#FF0000",
	white: "#FFFFFF",
	yellow: "#FFFF00"
}, Vt = /* @__PURE__ */ "#000000.#FFFFFF.#FF0000.#00FF00.#0000FF.#FFFF00.#FF00FF.#00FFFF.#000000.#FFFFFF.#FF0000.#00FF00.#0000FF.#FFFF00.#FF00FF.#00FFFF.#800000.#008000.#000080.#808000.#800080.#008080.#C0C0C0.#808080.#9999FF.#993366.#FFFFCC.#CCFFFF.#660066.#FF8080.#0066CC.#CCCCFF.#000080.#FF00FF.#FFFF00.#00FFFF.#800080.#800000.#008080.#0000FF.#00CCFF.#CCFFFF.#CCFFCC.#FFFF99.#99CCFF.#FF99CC.#CC99FF.#FFCC99.#3366FF.#33CCCC.#99CC00.#FFCC00.#FF9900.#FF6600.#666699.#969696.#003366.#339966.#003300.#333300.#993300.#993366.#333399.#333333".split(".");
function Ht(e) {
	let t = [], n = "", r = 0;
	for (; r < e.length;) {
		let i = e[r];
		if (i === "\"") {
			for (n += i, r++; r < e.length && e[r] !== "\"";) n += e[r++];
			r < e.length && (n += e[r++]);
		} else if (i === "\\") n += i, r + 1 < e.length && (n += e[r + 1]), r += 2;
		else if (i === "[") {
			for (n += i, r++; r < e.length && e[r] !== "]";) n += e[r++];
			r < e.length && (n += e[r++]);
		} else i === ";" ? (t.push(n), n = "", r++) : (n += i, r++);
	}
	return t.push(n), t;
}
function Ut(e) {
	let t = "", n, r, i = 0;
	for (; i < e.length;) {
		let a = e[i];
		if (a === "\"") {
			for (t += a, i++; i < e.length && e[i] !== "\"";) t += e[i++];
			i < e.length && (t += e[i++]);
		} else if (a === "\\") t += a, i + 1 < e.length && (t += e[i + 1]), i += 2;
		else if (a === "[") {
			let o = e.indexOf("]", i);
			if (o < 0) {
				t += a, i++;
				continue;
			}
			let s = e.slice(i + 1, o), c = s.toLowerCase(), l = c.match(/^color(\d{1,2})$/), u = s.match(/^(<=|>=|<>|<|>|=)\s*(-?[0-9.]+(?:[eE][-+]?\d+)?)$/);
			if (c in Bt) n = Bt[c];
			else if (l) {
				let e = parseInt(l[1], 10);
				e >= 1 && e <= 56 && (n = Vt[e + 7] ?? n);
			} else u ? r = {
				op: u[1],
				value: Number(u[2])
			} : t += e.slice(i, o + 1);
			i = o + 1;
		} else t += a, i++;
	}
	return {
		body: t,
		color: n,
		condition: r
	};
}
function Wt(e, t) {
	switch (e.op) {
		case "<": return t < e.value;
		case "<=": return t <= e.value;
		case ">": return t > e.value;
		case ">=": return t >= e.value;
		case "=": return t === e.value;
		case "<>": return t !== e.value;
	}
}
function Gt(e) {
	let t = [], n = "", r = "", i = !1, a = !1, o, s = !1, c = 0, l = 0, u = (e) => {
		if (!e) return;
		!a && !s && (c = n.replace(/,/g, "").length);
		let r = t[t.length - 1];
		r && r.kind === "lit" ? r.text += e : t.push({
			kind: "lit",
			text: e
		});
	}, d = 0;
	for (; d < e.length;) {
		let c = e[d];
		if (c === "\"") {
			d++;
			let t = "";
			for (; d < e.length && e[d] !== "\"";) t += e[d++];
			d < e.length && d++, u(t);
		} else if (c === "\\") d + 1 < e.length && u(e[d + 1]), d += 2;
		else if (c === "[") {
			let t = e.indexOf("]", d), n = t > d ? e.slice(d + 1, t) : "";
			if (n.startsWith("$")) {
				let e = n.slice(1), t = e.indexOf("-");
				u(t >= 0 ? e.slice(0, t) : e);
			}
			d = t < 0 ? e.length : t + 1;
		} else if (c === "_") u(" "), d += 2;
		else if (c === "*") u(e[d + 1] ?? ""), d += 2;
		else if (c === "#" || c === "0" || c === "?") a ? (r += c, t.push({
			kind: "fracph",
			ph: c
		})) : (n += c, t.push({
			kind: "intph",
			ph: c
		})), l = 0, d++;
		else if (c === ".") a = !0, t.push({ kind: "dot" }), d++;
		else if (c === ",") a || (n += ","), l++, d++;
		else if (c === "/" && n.replace(/,/g, "").length > 0) {
			s = !0, t.push({ kind: "fraction" }), d++;
			let n = "";
			for (; d < e.length && /[0-9#?]/.test(e[d]);) n += e[d++];
			t[t.length - 1].den = n;
		} else if (c === "%") i = !0, t.push({ kind: "percent" }), d++;
		else if ((c === "E" || c === "e") && (e[d + 1] === "+" || e[d + 1] === "-")) {
			let n = e[d + 1] === "+";
			d += 2;
			let r = 0;
			for (; d < e.length && (e[d] === "0" || e[d] === "#" || e[d] === "?");) r++, d++;
			o = {
				plus: n,
				width: Math.max(r, 1)
			}, t.push({ kind: "exp" });
		} else u(c), d++;
	}
	let f = l, p = /,(?=[#0?])/.test(n), m = n.replace(/,/g, ""), h;
	if (s) {
		let e = t.find((e) => e.kind === "fraction")?.den ?? "?", n = e.match(/[0-9]+/);
		h = {
			wholeSpec: m.slice(0, c),
			numSpec: m.slice(c) || "?",
			denSpec: e.replace(/[^0#?]/g, ""),
			fixedDen: n ? parseInt(n[0], 10) : null
		};
	}
	return {
		parts: t,
		intSpec: m,
		fracSpec: r,
		hasPercent: i,
		commaScale: f,
		grouping: p,
		exp: o,
		fraction: h
	};
}
function Kt(e) {
	return e.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function qt(e, t, n) {
	let r = t.split(""), i = e.split(""), a = [], o = i.length - 1, s = [];
	for (let e = r.length - 1; e >= 0; e--) o >= 0 ? (a.unshift(i[o]), s.unshift(i[o]), o--) : r[e] === "0" ? (a.unshift("0"), s.unshift("0")) : r[e] === "?" && a.unshift(" ");
	for (; o >= 0;) a.unshift(i[o]), s.unshift(i[o]), o--;
	if (n) {
		let e = Kt(s.join(""));
		return (a.length - s.length > 0 ? a.slice(0, a.length - s.length).join("") : "") + e;
	}
	return a.join("");
}
function Jt(e, t) {
	let n = t.length;
	if (n === 0) return "";
	let r = e.padEnd(n, "0").slice(0, n).split("");
	for (let e = n - 1; e >= 0; e--) {
		let n = t[e] ?? "#";
		if (r[e] === "0" && n === "#") r[e] = "";
		else if (r[e] === "0" && n === "?") r[e] = " ";
		else break;
	}
	return r.join("");
}
function Yt(e, t, n) {
	if (n !== null) return [Math.round(e * n), n];
	let r = 10 ** Math.max(t, 1) - 1, i = 0, a = 1, o = Math.abs(e), s = [0, 1], c = [1, 1];
	for (let t = 0; t < 100; t++) {
		let t = s[0] + c[0], n = s[1] + c[1];
		if (n > r) break;
		let l = t / n, u = Math.abs(l - e);
		if (u < o && (o = u, i = t, a = n), l < e) s = [t, n];
		else if (l > e) c = [t, n];
		else break;
	}
	return [i, a];
}
function Xt(e, t, n) {
	let r = Gt(t), i = n ? Math.abs(e) : e;
	r.hasPercent && (i *= 100), r.commaScale > 0 && (i /= 1e3 ** r.commaScale);
	let a = i < 0 ? "-" : "", s = Math.abs(i);
	if (r.fraction) {
		let e = Math.floor(s), t = s - e, { wholeSpec: n, numSpec: i, denSpec: o, fixedDen: c } = r.fraction, l = n.length > 0, [u, d] = Yt(t, o.length, c), f = (e, t) => {
			let n = String(e), r = t.includes("0") ? "0" : " ";
			for (; n.length < t.length;) n = r + n;
			return n;
		}, p = (e, t) => {
			let n = String(e), r = t.includes("0") ? "0" : " ";
			for (; n.length < t.length;) n += r;
			return n;
		}, m = a;
		if (l) {
			let t = e > 0 ? String(e) : n.includes("0") ? "0" : "";
			if (u === 0) {
				let e = c === null ? o.length || 1 : String(c).length;
				m += t + " ".repeat(1 + i.length + 1 + e);
			} else {
				let e = c === null ? p(d, o) : String(c);
				m += t + " " + f(u, i) + "/" + e;
			}
		} else {
			let t = u + e * d, n = c === null ? p(d, o) : String(c);
			m += f(t, i) + "/" + n;
		}
		return m;
	}
	if (r.exp) {
		let e = Math.max(r.intSpec.length, 1), t = r.fracSpec.length, n = 0, i = 0;
		s !== 0 && (i = Math.floor(Math.log10(s)), i = Math.floor(i / e) * e, n = s / 10 ** i, parseFloat(o(n, t)) >= 10 ** e && (i += e, n = s / 10 ** i));
		let [c, l = ""] = o(n, t).split(".");
		return a + Zt(r, qt(c, r.intSpec, !1), Jt(l, r.fracSpec), "E" + (i < 0 ? "-" : r.exp.plus ? "+" : "") + String(Math.abs(i)).padStart(r.exp.width, "0"));
	}
	let c = r.fracSpec.length, [l, u = ""] = o(s, c).split("."), d = l.replace(/^0+/, ""), f = /[0]/.test(r.intSpec) || r.intSpec === "" && !1;
	return d === "" && f && (d = "0"), a + Zt(r, qt(d, r.intSpec, r.grouping), Jt(u, r.fracSpec), "");
}
function Zt(e, t, n, r) {
	let i = t.split(""), a = [];
	e.parts.forEach((e, t) => {
		e.kind === "intph" && a.push(t);
	});
	let o = n.split(""), s = [];
	e.parts.forEach((e, t) => {
		e.kind === "fracph" && s.push(t);
	});
	let c = /* @__PURE__ */ new Map(), l = i.length - 1;
	for (let e = a.length - 1; e >= 0; e--) if (e === 0) {
		let t = "";
		for (; l >= 0;) t = i[l--] + t;
		c.set(a[e], t);
	} else l >= 0 ? c.set(a[e], i[l--]) : c.set(a[e], "");
	let u = /* @__PURE__ */ new Map();
	for (let e = 0; e < s.length; e++) u.set(s[e], o[e] ?? "");
	let d = e.fracSpec.length > 0 && (n.length > 0 || /[0?]/.test(e.fracSpec)), f = "";
	for (let t = 0; t < e.parts.length; t++) {
		let n = e.parts[t];
		n.kind === "lit" ? f += n.text : n.kind === "intph" ? f += c.get(t) ?? "" : n.kind === "fracph" ? f += u.get(t) ?? "" : n.kind === "dot" ? f += d ? "." : "" : n.kind === "percent" ? f += "%" : n.kind === "exp" && (f += r);
	}
	return f;
}
function Qt(e, t) {
	let n = Ht(t).map(Ut), r = n.some((e) => e.condition), i, a = !1;
	if (r) {
		let t = !1;
		for (let r of n) if (r.condition) {
			if (Wt(r.condition, e)) {
				i = r, t = !0;
				break;
			}
		} else if (i ??= r, i === r) break;
		if (!i) return { text: "#" };
		a = t && e < 0;
	} else e > 0 ? i = n[0] : e < 0 ? n.length > 1 ? (i = n[1], a = !0) : i = n[0] : i = n.length > 2 ? n[2] : n[0];
	let o = Xt(e, i.body, a);
	return i.color ? {
		text: o,
		color: i.color
	} : { text: o };
}
//#endregion
//#region packages/xlsx/src/conditional-format.ts
function $t(e, t, n) {
	for (let r of e) if (t >= r.top && t <= r.bottom && n >= r.left && n <= r.right) return !0;
	return !1;
}
function en(e) {
	return e && e.value.type === "number" ? e.value.number : null;
}
function tn(e) {
	return e && e.value.type === "text" ? e.value.text : null;
}
function nn(e, t) {
	let n = [];
	for (let r of e.rows) for (let e of r.cells) e.value.type === "number" && $t(t, e.row, e.col) && n.push(e.value.number);
	return n;
}
function rn(e, t) {
	let n = t.length ? Math.min(...t) : 0, r = t.length ? Math.max(...t) : 0, i = e.value == null ? NaN : parseFloat(e.value);
	switch (e.kind) {
		case "min": return n;
		case "max": return r;
		case "num": return isNaN(i) ? 0 : i;
		case "percent": {
			let e = isNaN(i) ? 50 : i;
			return n + (r - n) * (e / 100);
		}
		case "percentile": {
			if (!t.length) return 0;
			let e = [...t].sort((e, t) => e - t), n = (isNaN(i) ? 50 : i) / 100;
			return e[Math.max(0, Math.min(e.length - 1, Math.round(n * (e.length - 1))))];
		}
		default: return isNaN(i) ? 0 : i;
	}
}
function an(e) {
	let t = [], n = /* @__PURE__ */ new Map();
	for (let t of e.rows) for (let e of t.cells) n.set(`${e.row}:${e.col}`, e);
	let r = /* @__PURE__ */ new Map();
	for (let t of e.definedNames ?? []) r.set(t.name, t);
	for (let n of e.conditionalFormats ?? []) {
		let r = nn(e, n.sqref);
		for (let e of n.rules) {
			let i = {
				rule: e,
				sqref: n.sqref
			};
			if (e.type === "colorScale") i.scaleStops = e.stops.map((e) => rn(e, r));
			else if (e.type === "dataBar") i.barMin = rn(e.min, r), i.barMax = rn(e.max, r);
			else if (e.type === "top10") {
				let t = [...r].sort((e, t) => e - t), n = t.length;
				if (n > 0) {
					let r = Math.min(e.rank, n);
					if (e.percent) {
						let a = e.top ? 1 - r / 100 : r / 100;
						i.top10Threshold = t[Math.max(0, Math.min(n - 1, Math.round(a * (n - 1))))];
					} else i.top10Threshold = e.top ? t[Math.max(0, n - r)] : t[Math.min(n - 1, r - 1)];
					i.top10IsTop = e.top;
				}
			} else if (e.type === "aboveAverage") {
				if (r.length > 0) {
					let t = r.reduce((e, t) => e + t, 0) / r.length;
					if (i.avgValue = t, i.avgIsAbove = e.aboveAverage, e.stdDev && e.stdDev > 0) {
						let e = r.reduce((e, n) => e + (n - t) * (n - t), 0) / r.length;
						i.avgStdDev = Math.sqrt(e);
					}
				}
			} else e.type === "iconSet" && (i.iconThresholds = e.cfvos.map((e) => rn(e, r)));
			t.push(i);
		}
	}
	return t.sort((e, t) => (e.rule.priority ?? 0) - (t.rule.priority ?? 0)), {
		compiled: t,
		worksheet: e,
		cellIndex: n,
		definedNames: r
	};
}
function on(e, t, n) {
	switch (t) {
		case "greaterThan": return e > (n[0] ?? 0);
		case "greaterThanOrEqual": return e >= (n[0] ?? 0);
		case "lessThan": return e < (n[0] ?? 0);
		case "lessThanOrEqual": return e <= (n[0] ?? 0);
		case "equal": return e === (n[0] ?? 0);
		case "notEqual": return e !== (n[0] ?? 0);
		case "between": return e >= (n[0] ?? 0) && e <= (n[1] ?? 0);
		case "notBetween": return e < (n[0] ?? 0) || e > (n[1] ?? 0);
		default: return !1;
	}
}
function sn(e) {
	let t = e.trim();
	if (t.length >= 2 && t.startsWith("\"") && t.endsWith("\"")) return { text: t.slice(1, -1).replace(/""/g, "\"") };
	let n = parseFloat(t);
	return isNaN(n) ? { text: t } : { num: n };
}
function cn(e, t, n) {
	let r = n[0] ?? "", i = n[1] ?? "", a = (e) => e.toLowerCase();
	switch (t) {
		case "equal": return a(e) === a(r);
		case "notEqual": return a(e) !== a(r);
		case "containsText": return a(e).includes(a(r));
		case "notContains": return !a(e).includes(a(r));
		case "beginsWith": return a(e).startsWith(a(r));
		case "endsWith": return a(e).endsWith(a(r));
		case "between": return a(e) >= a(r) && a(e) <= a(i);
		case "notBetween": return a(e) < a(r) || a(e) > a(i);
		default: return !1;
	}
}
function ln(e, t, n) {
	let r = e.replace("#", ""), i = t.replace("#", ""), a = parseInt(r.slice(0, 2), 16), o = parseInt(r.slice(2, 4), 16), s = parseInt(r.slice(4, 6), 16), c = parseInt(i.slice(0, 2), 16), l = parseInt(i.slice(2, 4), 16), u = parseInt(i.slice(4, 6), 16), d = Math.round(a + (c - a) * n), f = Math.round(o + (l - o) * n), p = Math.round(s + (u - s) * n);
	return `#${d.toString(16).padStart(2, "0").toUpperCase()}${f.toString(16).padStart(2, "0").toUpperCase()}${p.toString(16).padStart(2, "0").toUpperCase()}`;
}
function un(e, t, n) {
	if (!t.length) return "#FFFFFF";
	if (e <= n[0]) return t[0].color;
	if (e >= n[n.length - 1]) return t[t.length - 1].color;
	for (let r = 1; r < n.length; r++) if (e <= n[r]) {
		let i = n[r - 1], a = n[r], o = a === i ? 0 : (e - i) / (a - i);
		return ln(t[r - 1].color, t[r].color, o);
	}
	return t[t.length - 1].color;
}
function dn(e, t) {
	if (t && (t.fill && !e.fill && (e.fill = t.fill), t.font?.color && e.fontColor == null && (e.fontColor = t.font.color), t.font?.bold && e.fontBold == null && (e.fontBold = !0), t.font?.italic && e.fontItalic == null && (e.fontItalic = !0), t.font?.underline && e.fontUnderline == null && (e.fontUnderline = !0), t.font?.strike && e.fontStrike == null && (e.fontStrike = !0), t.numFmt && e.numFmt == null && (e.numFmt = {
		numFmtId: t.numFmt.numFmtId,
		formatCode: t.numFmt.formatCode || null
	}), t.border)) {
		let n = e.border ?? {};
		e.border = {
			left: n.left ?? t.border.left,
			right: n.right ?? t.border.right,
			top: n.top ?? t.border.top,
			bottom: n.bottom ?? t.border.bottom,
			diagonalUp: n.diagonalUp ?? t.border.diagonalUp,
			diagonalDown: n.diagonalDown ?? t.border.diagonalDown
		};
	}
}
function fn(e, t, n, r, i) {
	let a = {};
	if (!r.compiled.length) return a;
	for (let o of r.compiled) {
		if (!$t(o.sqref, t, n)) continue;
		let s = o.rule, c = en(e);
		if (s.type === "expression") {
			let e = o.sqref[0];
			if (!e) continue;
			if (Ve(s.formula, {
				row: t,
				col: n,
				anchorRow: e.top,
				anchorCol: e.left,
				cellIndex: r.cellIndex,
				definedNames: r.definedNames,
				depth: 0
			}) && (dn(a, s.dxfId == null ? null : i[s.dxfId]), s.stopIfTrue)) break;
			continue;
		}
		if (s.type === "cellIs") {
			let t = s.formulas.map(sn), n = tn(e), r = !1;
			c != null && t.every((e) => e.num != null) ? r = on(c, s.operator, t.map((e) => e.num)) : n != null && t.every((e) => e.text != null) && (r = cn(n, s.operator, t.map((e) => e.text))), r && dn(a, s.dxfId == null ? null : i[s.dxfId]);
		} else if (s.type === "top10") {
			if (c == null || o.top10Threshold == null) continue;
			(o.top10IsTop ? c >= o.top10Threshold : c <= o.top10Threshold) && dn(a, s.dxfId == null ? null : i[s.dxfId]);
		} else if (s.type === "aboveAverage") {
			if (c == null || o.avgValue == null) continue;
			let e = o.avgStdDev == null ? 0 : o.avgStdDev * (s.stdDev ?? 1), t = o.avgIsAbove ? o.avgValue + e : o.avgValue - e, n = s.equalAverage === !0;
			(o.avgIsAbove ? n ? c >= t : c > t : n ? c <= t : c < t) && dn(a, s.dxfId == null ? null : i[s.dxfId]);
		} else if (s.type === "iconSet") {
			if (c == null || !o.iconThresholds?.length) continue;
			let e = o.iconThresholds, t = e.length, n = 0;
			for (let r = 1; r < t; r++) c >= e[r] && (n = r);
			if (s.reverse && (n = t - 1 - n), s.customIcons && s.customIcons[n]) {
				let e = s.customIcons[n];
				e.iconSet !== "NoIcons" && (a.iconSet = {
					name: e.iconSet,
					index: e.iconId
				});
			} else a.iconSet = {
				name: s.iconSet,
				index: n
			};
		} else if (s.type === "colorScale") {
			if (c == null || !o.scaleStops || a.fill) continue;
			let e = un(c, s.stops, o.scaleStops);
			a.fill = {
				patternType: "solid",
				fgColor: e,
				bgColor: e
			};
		} else if (s.type === "dataBar") {
			if (c == null || o.barMin == null || o.barMax == null || a.dataBar) continue;
			let e = o.barMax - o.barMin, t = e === 0 ? 0 : Math.max(0, Math.min(1, (c - o.barMin) / e));
			a.dataBar = {
				color: s.color,
				ratio: t,
				gradient: s.gradient
			};
		}
	}
	return a;
}
//#endregion
//#region packages/xlsx/src/bidi-line.ts
function pn(e, t) {
	return e === 2 ? !0 : e === 1 ? !1 : je(void 0, t) === "rtl";
}
var mn = (e) => {
	let t = e.text;
	return typeof t == "string" ? t : void 0;
};
function hn(e, t) {
	let n = e === 2 || M(t);
	return {
		needBidi: n,
		baseRtl: n && pn(e, t)
	};
}
function gn(e, t) {
	let r = e.length;
	if (r === 0) return {
		order: [],
		rtl: []
	};
	let i = "", a = Array(r);
	for (let t = 0; t < r; t++) {
		a[t] = i.length;
		let n = mn(e[t]) ?? "";
		i += n.length > 0 ? n : "￼";
	}
	let { levels: o, paragraphLevel: s } = f().computeLevels(i, t ? "rtl" : "ltr"), { order: c, segLevels: l } = n(o, s, a), u = Array(r);
	for (let e = 0; e < r; e++) u[e] = (l[e] & 1) == 1;
	return {
		order: c,
		rtl: u
	};
}
//#endregion
//#region packages/xlsx/src/a1.ts
function _n(e) {
	let t = /^\$?([A-Z]+)\$?(\d+)$/.exec(e.trim());
	if (!t) return null;
	let n = t[1], r = 0;
	for (let e = 0; e < n.length; e++) r = r * 26 + (n.charCodeAt(e) - 64);
	return {
		row: parseInt(t[2], 10),
		col: r
	};
}
function vn(e, t) {
	let n = "", r = t;
	for (; r > 0;) {
		let e = (r - 1) % 26;
		n = String.fromCharCode(65 + e) + n, r = Math.floor((r - 1) / 26);
	}
	return `${n}${e}`;
}
//#endregion
//#region packages/xlsx/src/vertical-text.ts
function yn(e, t, n, r, a, o = !1) {
	let s = t.codePointAt(0) ?? 0, c = ee(s);
	if (o && i(s)) {
		e.save(), e.translate(n, r + a / 2), e.textAlign = "center", e.textBaseline = "middle", ge(e, () => e.fillText(t, 0, 0)), e.restore();
		return;
	}
	if (c === "Tr") {
		let i = z(s);
		if (i !== null) {
			e.fillText(String.fromCodePoint(i), n, r);
			return;
		}
		if (ve(s)) {
			e.fillText(t, n, r);
			return;
		}
		e.save(), e.translate(n, r + a / 2), e.rotate(Math.PI / 2), e.textAlign = "center", e.textBaseline = "middle", e.fillText(t, 0, 0), e.restore();
		return;
	}
	let l = c === "Tu" ? ye(s) : null;
	e.fillText(l === null ? t : String.fromCodePoint(l), n, r);
}
//#endregion
//#region packages/xlsx/src/renderer.ts
function bn(e, t) {
	return t ? `${e}|duo:${t.clr1}:${t.clr2}` : e;
}
var xn = C.map((e) => `"${e}"`).join(", "), Sn = E.map((e) => `"${e}"`).join(", "), Cn = `"Calibri", "Carlito", "Cambria", "Caladea", Arial, "Noto Naskh Arabic", "Noto Sans Arabic", ${xn}, sans-serif`, wn = `"Cambria", "Caladea", "Times New Roman", "Liberation Serif", "Noto Naskh Arabic", "Noto Sans Arabic", ${Sn}, serif`, Tn = "\"Courier New\", \"Liberation Mono\", monospace";
function En(e) {
	let t = e ? y(e) : null, n = O(e);
	if (!t) return n === "serif" ? wn : n === "mono" ? Tn : Cn;
	let r = n === "serif";
	return `${m(t, r ? "serif" : "sans").map((e) => `"${e}"`).join(", ")}, "Calibri", "Carlito", "Cambria", "Caladea", Arial, "Noto Naskh Arabic", "Noto Sans Arabic", ${r ? Sn : xn}, ${r ? "serif" : "sans-serif"}`;
}
function Dn(e) {
	return e ? `"${e}", ${En(e)}` : Cn;
}
var On = 11, kn = 8;
function An(e, t, n) {
	return n - e - t;
}
function jn(e, t, n, r) {
	return r ? An(e, t, n) : e;
}
var Mn = "#7a7a7a", Nn = /* @__PURE__ */ new Map(), Pn = {
	"meiryo ui": {
		10: 8,
		11: 8
	},
	meiryo: {
		10: 8,
		11: 8
	}
};
function Fn(e, t) {
	let n = `${e}:${t}`, r = Nn.get(n);
	if (r !== void 0) return r;
	let i = Pn[e.toLowerCase()]?.[Math.round(t)];
	if (i !== void 0) return Nn.set(n, i), i;
	let a = t * x, o = typeof OffscreenCanvas < "u" ? new OffscreenCanvas(1, 1) : typeof document < "u" ? document.createElement("canvas") : null;
	if (!o) return kn;
	let s = o.getContext("2d");
	if (!s) return kn;
	s.font = `${a}px ${Dn(e)}`;
	let c = 0;
	for (let e of "0123456789") {
		let t = s.measureText(e).width;
		t > c && (c = t);
	}
	let l = Math.round(c) || kn;
	return Nn.set(n, l), l;
}
function Z(e) {
	return !e.defaultFontFamily || !e.defaultFontSize ? kn : Fn(e.defaultFontFamily, e.defaultFontSize);
}
function Q(e, t = kn) {
	return Math.trunc((256 * e + Math.trunc(128 / t)) / 256 * t);
}
function In(e, t = kn) {
	return e / t;
}
function $(e) {
	return Math.round(e * x);
}
function Ln(e) {
	return e / x;
}
function Rn(e, t, n, r, i, a, o) {
	if (!(i <= 0 || a <= 0)) {
		if (o) {
			let a = e.createLinearGradient(n, r, n + i, r);
			a.addColorStop(0, J(t, .85)), a.addColorStop(1, J(t, .15)), e.fillStyle = a;
		} else e.fillStyle = J(t);
		e.fillRect(n, r, i, a);
	}
}
function zn(e) {
	switch (e) {
		case "solid": return 1;
		case "darkGray": return .75;
		case "mediumGray": return .5;
		case "lightGray": return .25;
		case "gray125": return .125;
		case "gray0625": return .0625;
		case "darkHorizontal":
		case "darkVertical":
		case "darkDown":
		case "darkUp":
		case "darkGrid":
		case "darkTrellis": return .5;
		case "lightHorizontal":
		case "lightVertical":
		case "lightDown":
		case "lightUp":
		case "lightGrid":
		case "lightTrellis": return .25;
		default: return 1;
	}
}
var Bn = /* @__PURE__ */ new Map(), Vn = {
	gray0625: [
		128,
		0,
		8,
		0,
		128,
		0,
		8,
		0
	],
	gray125: [
		136,
		0,
		34,
		0,
		136,
		0,
		34,
		0
	],
	lightGray: [
		170,
		0,
		85,
		0,
		170,
		0,
		85,
		0
	],
	mediumGray: [
		170,
		85,
		170,
		85,
		170,
		85,
		170,
		85
	],
	darkGray: [
		119,
		221,
		119,
		221,
		119,
		221,
		119,
		221
	],
	darkHorizontal: [
		4095,
		4095,
		0,
		4095,
		4095,
		0,
		4095,
		4095,
		0,
		4095,
		4095,
		0
	],
	lightHorizontal: [
		4095,
		0,
		0,
		4095,
		0,
		0,
		4095,
		0,
		0,
		4095,
		0,
		0
	],
	darkVertical: Array(12).fill(3510),
	lightVertical: Array(12).fill(2340),
	darkGrid: [
		204,
		204,
		51,
		51,
		204,
		204,
		51,
		51
	],
	lightGrid: [
		255,
		136,
		136,
		136,
		255,
		136,
		136,
		136
	],
	darkDown: [
		204,
		102,
		51,
		153,
		204,
		102,
		51,
		153
	],
	lightDown: [
		136,
		68,
		34,
		17,
		136,
		68,
		34,
		17
	],
	darkUp: [
		51,
		102,
		204,
		153,
		51,
		102,
		204,
		153
	],
	lightUp: [
		17,
		34,
		68,
		136,
		17,
		34,
		68,
		136
	],
	darkTrellis: [
		255,
		102,
		255,
		153,
		255,
		102,
		255,
		153
	],
	lightTrellis: [
		153,
		102,
		102,
		153,
		153,
		102,
		102,
		153
	]
};
function Hn(e, t, n, r) {
	let i = e.getTransform(), a = Math.max(1, Math.round(Math.hypot(i.a, i.b))), o = Math.max(1, Math.round(Math.hypot(i.c, i.d))), s = `${t}|${n}|${r}|${a}|${o}`;
	if (Bn.has(s)) return Bn.get(s);
	let l = Vn[t];
	if (!l) return Bn.set(s, null), null;
	let u = l.length, d = c(u, u);
	if (!d) return Bn.set(s, null), null;
	let f = d.getContext("2d");
	if (!f) return Bn.set(s, null), null;
	f.fillStyle = J(r), f.fillRect(0, 0, u, u), f.fillStyle = J(n);
	for (let e = 0; e < u; e++) {
		let t = l[e];
		for (let n = 0; n < u; n++) t & 1 << u - 1 - n && f.fillRect(n, e, 1, 1);
	}
	let p = e.createPattern(d, "repeat");
	if (p && typeof DOMMatrix < "u" && (a >= 2 || o >= 2)) {
		let e = new DOMMatrix();
		e.scaleSelf(1 / a, 1 / o), p.setTransform(e);
	}
	return Bn.set(s, p), p;
}
function Un(e, t, n, r, i, a) {
	if (t.gradient && t.gradient.stops.length > 0) return e.fillStyle = Wn(e, t.gradient, n, r, i, a), e.fillRect(n, r, i, a), !0;
	let o = t.patternType;
	if (!o || o === "none") return !1;
	let s = t.fgColor ?? "000000", c = t.bgColor ?? "FFFFFF";
	if (o === "solid") return e.fillStyle = J(s), e.fillRect(n, r, i, a), !0;
	let l = Hn(e, o, s, c);
	if (l) e.fillStyle = l;
	else {
		let t = zn(o);
		e.fillStyle = t >= 1 ? J(s) : qn(s, c, t);
	}
	return e.fillRect(n, r, i, a), !0;
}
function Wn(e, t, n, r, i, a) {
	let o;
	if (t.gradientType === "path") {
		let s = n + i * (t.left + (1 - t.right - t.left) / 2), c = r + a * (t.top + (1 - t.bottom - t.top) / 2), l = Math.hypot(Math.max(s - n, n + i - s), Math.max(c - r, r + a - c));
		o = e.createRadialGradient(s, c, 0, s, c, l);
	} else {
		let s = t.degree * Math.PI / 180, c = n + i / 2, l = r + a / 2, u = (Math.abs(Math.cos(s)) * i + Math.abs(Math.sin(s)) * a) / 2;
		o = e.createLinearGradient(c - Math.cos(s) * u, l - Math.sin(s) * u, c + Math.cos(s) * u, l + Math.sin(s) * u);
	}
	for (let e of t.stops) {
		let t = Math.min(1, Math.max(0, e.position));
		o.addColorStop(t, J(e.color));
	}
	return o;
}
var Gn = _n;
function Kn(e, t, n, r, i) {
	let a = Math.max(4, Math.min(8, Math.min(r, i) * .18));
	e.save(), e.fillStyle = "#D40000", e.beginPath(), e.moveTo(t + r - a, n), e.lineTo(t + r, n), e.lineTo(t + r, n + a), e.closePath(), e.fill(), e.restore();
}
function qn(e, t, n) {
	let r = e.replace("#", ""), i = t.replace("#", ""), a = parseInt(r.slice(0, 2), 16), o = parseInt(r.slice(2, 4), 16), s = parseInt(r.slice(4, 6), 16), c = parseInt(i.slice(0, 2), 16), l = parseInt(i.slice(2, 4), 16), u = parseInt(i.slice(4, 6), 16), d = Math.min(1, Math.max(0, n));
	return `rgb(${Math.round(a * d + c * (1 - d))},${Math.round(o * d + l * (1 - d))},${Math.round(s * d + u * (1 - d))})`;
}
function Jn(e, t, n = 1, r) {
	let i = Math.round(e * x * n * t);
	return r ? Math.max(i, Math.round(G(r, e * x * t))) : i;
}
function Yn(e, t = 1) {
	return `${e.italic ? "italic " : ""}${e.bold ? "bold " : ""}${Math.max(1, Math.round(e.size * x * t))}px ${Dn(e.name)}`;
}
function Xn(e, t, n, r, i, a, o, s, c, l) {
	if (t.length === 0) return;
	let u = n?.fontId ?? 0, d = a.fonts[u] ?? a.fonts[0];
	if (!d) return;
	let f = n?.alignment ?? "left";
	e.save(), e.font = Yn(d, c), e.textBaseline = "top", e.textAlign = "left", e.fillStyle = l;
	let p = s + Math.round(2 * c);
	if (f === "noControl") {
		let n = o;
		for (let r of t) e.fillText(r.text, n, p), n += e.measureText(r.text).width;
		e.restore();
		return;
	}
	let m = Re(t, r, o, f, (t) => Zn(e, t, i));
	for (let t of m) {
		let n = e.measureText(t.text).width, r = [...t.text];
		if (t.spread === "distribute" && r.length > 1 && n < t.width) {
			let i = (t.width - n) / (r.length - 1);
			try {
				e.letterSpacing = `${i}px`;
			} catch {}
			e.fillText(t.text, t.x, p);
			try {
				e.letterSpacing = "0px";
			} catch {}
		} else t.spread === "center" ? e.fillText(t.text, t.x + (t.width - n) / 2, p) : e.fillText(t.text, t.x, p);
	}
	e.restore();
}
function Zn(e, t, n) {
	let r = e.font;
	e.font = n;
	let i = e.measureText(t).width;
	return e.font = r, i;
}
function Qn(e, t, n, r, i, a, o = 1) {
	if (e.save(), e.strokeStyle = i, e.lineWidth = .5, e.beginPath(), a) {
		let i = r - 1, a = r + 1, s = i + d(i, .5, o), c = a + d(a, .5, o);
		e.moveTo(t, s), e.lineTo(n, s), e.moveTo(t, c), e.lineTo(n, c);
	} else {
		let i = r + d(r, .5, o);
		e.moveTo(t, i), e.lineTo(n, i);
	}
	e.stroke(), e.restore();
}
function $n(e, t) {
	let n = t.font;
	return n ? {
		bold: n.bold,
		italic: n.italic,
		underline: n.underline,
		underlineStyle: n.underlineStyle,
		strike: n.strike,
		size: n.size ?? e.size,
		color: n.color ?? e.color,
		name: n.name ?? e.name,
		vertAlign: n.vertAlign
	} : e;
}
function er(e, t) {
	let n = e.cellXfs[t] ?? e.cellXfs[0] ?? {
		fontId: 0,
		fillId: 0,
		borderId: 0,
		numFmtId: 0,
		alignH: null,
		alignV: null,
		wrapText: !1
	};
	return {
		font: e.fonts[n.fontId] ?? {
			bold: !1,
			italic: !1,
			underline: !1,
			strike: !1,
			size: On,
			color: null,
			name: null
		},
		fill: e.fills[n.fillId] ?? {
			patternType: "none",
			fgColor: null,
			bgColor: null
		},
		border: e.borders[n.borderId] ?? {
			left: null,
			right: null,
			top: null,
			bottom: null
		},
		xf: n
	};
}
function tr(e, t, n) {
	let r = [];
	for (let i of t.split("\n")) r.push(...ar(e, i, n));
	return r;
}
function nr(e, t) {
	if (e.length === 0 || t.length === 0) return 0;
	let n = [...e, ...t], r = e.length;
	return r - v(n, r, D, 1);
}
function rr(e, t) {
	let n = t;
	for (; n < e.length;) {
		let t = e[e.length - n - 1], r = e[e.length - n], i = t?.codePointAt(0), a = r?.codePointAt(0);
		if (i !== void 0 && a !== void 0 && l(i) && l(a)) n++;
		else break;
	}
	return n >= e.length ? t : n;
}
function ir(e, t) {
	if (e.length === 0 || t.length === 0) return 0;
	let n = t[0].codePointAt(0), r = e.length - 1, i = e[r].codePointAt(0);
	if (i === void 0 || n === void 0 || i === 8203 || n === 8203 || !S(i, n)) return 0;
	for (; r > 0;) {
		let t = e[r - 1].codePointAt(0), n = e[r].codePointAt(0);
		if (t === void 0 || n === void 0 || !S(t, n)) break;
		r--;
	}
	return r === 0 ? 0 : e.length - r;
}
function ar(e, t, n) {
	let r = [], i = [], a = 0;
	for (; a < t.length;) {
		let e = t[a], n = e.codePointAt(0) ?? 0;
		if (T(n)) i.push(e), a += n > 65535 ? 2 : 1;
		else if (e === " ") {
			let e = a;
			for (; e < t.length && t[e] === " ";) e++;
			i.push(t.slice(a, e)), a = e;
		} else {
			let e = a;
			for (; e < t.length;) {
				let n = t[e], r = n.codePointAt(0) ?? 0;
				if (n === " " || T(r)) break;
				e += r > 65535 ? 2 : 1;
			}
			let n = t.slice(a, e), r = k(n) ? b(n) : null;
			if (r && r.length > 0) {
				let e = 0;
				for (let t of r) i.push(n.slice(e, t)), e = t;
				i.push(n.slice(e));
			} else i.push(n);
			a = e;
		}
	}
	let o = "";
	for (let t of i) {
		if (o === "") {
			o = t;
			continue;
		}
		let i = o + t;
		if (e.measureText(i).width <= n) o = i;
		else {
			let e = t.replace(/^ +/, "");
			e === "" && (e = t);
			let n = [...o], i = nr(n, [...e]);
			if (i > 0) {
				let t = n.length - i;
				r.push(n.slice(0, t).join("")), o = n.slice(t).join("") + e;
			} else r.push(o), o = e;
		}
	}
	return r.push(o), r;
}
function or(e, t, n, r, i) {
	let o = [], c = [], l = 0, u = 0, d = null, f = n.size, p = n.name, m = 0, h = () => {
		c.length !== 0 && (o.push({
			segments: c,
			maxFontSize: u,
			maxFontFamily: d,
			para: m
		}), c = [], l = 0, u = 0, d = null);
	}, g = () => {
		if (c.length === 0) {
			o.push({
				segments: [],
				maxFontSize: f || On,
				maxFontFamily: p,
				para: m
			});
			return;
		}
		h();
	}, _ = (t, n) => {
		if (!t) return;
		f = n.size, p = n.name, e.font = Yn(cr(n), r);
		let a = e.measureText(t).width;
		if (c.length > 0 && l + a > i) {
			let i = c.flatMap((e) => [...e.text]), a = nr(i, [...t]);
			a > 0 ? a = rr(i, a) : !k(t) && !k(c[c.length - 1]?.text ?? "") && !/^\s/u.test(t) && !/\s$/u.test(i.at(-1) ?? "") && (a = ir(i, [...t]));
			let o = c[c.length - 1], s = [...o.text];
			a > s.length && (a = s.length);
			let f = null;
			if (a > 0) {
				let t = s.slice(0, s.length - a), n = s.slice(s.length - a);
				if (e.font = Yn(cr(o.font), r), t.length === 0) c.pop();
				else {
					let n = t.join("");
					o.text = n, o.width = e.measureText(n).width;
				}
				let i = n.join("");
				f = {
					text: i,
					font: o.font,
					width: e.measureText(i).width
				};
			}
			h(), f && (c.push(f), l += f.width, f.font.size > u && (u = f.font.size, d = f.font.name)), e.font = Yn(cr(n), r);
		}
		c.push({
			text: t,
			font: n,
			width: a
		}), l += a, n.size > u && (u = n.size, d = n.name);
	}, v = (t, n) => {
		let o = b(t);
		if (o.length === 0) {
			_(t, n);
			return;
		}
		e.font = Yn(cr(n), r);
		let c = (t) => e.measureText(t).width, u = re(t), d = t.length, f = 0;
		for (; f < d;) {
			let e = i - l, r = s(t, o, f, e, c, u);
			if (r <= f) {
				if (l > 0) {
					h();
					continue;
				}
				let n = o.find((e) => e > f) ?? d, i = t.slice(f, n), p = a(i), m = s(i, p, 0, e, c, u);
				m <= 0 && (m = p.length > 0 ? p[0] : i.length), r = f + m;
			}
			_(t.slice(f, r), n), f = r, f < d && h();
		}
	};
	for (let e of t) {
		let t = $n(n, e), r = [], i = 0;
		for (; i < e.text.length;) {
			let t = e.text[i], n = t.codePointAt(0) ?? 0;
			if (n === 10) r.push("\n"), i += 1;
			else if (T(n)) r.push(t), i += n > 65535 ? 2 : 1;
			else if (t === " ") {
				let t = i;
				for (; t < e.text.length && e.text[t] === " ";) t++;
				r.push(e.text.slice(i, t)), i = t;
			} else {
				let t = i;
				for (; t < e.text.length;) {
					let n = e.text[t], r = n.codePointAt(0) ?? 0;
					if (n === " " || n === "\n" || T(r)) break;
					t += r > 65535 ? 2 : 1;
				}
				r.push(e.text.slice(i, t)), i = t;
			}
		}
		for (let e of r) e === "\n" ? (g(), m++) : k(e) ? v(e, t) : _(e, t);
	}
	return (c.length > 0 || o.length > 0) && g(), o;
}
function sr(e, t, n) {
	return e === "middle" ? {
		underline: t + Math.round(n * .55),
		strike: t
	} : e === "bottom" ? {
		underline: t + 1,
		strike: t - Math.round(n * .35)
	} : {
		underline: t + n + 1,
		strike: t + Math.round(n * .5)
	};
}
function cr(e) {
	return e.vertAlign === "superscript" || e.vertAlign === "subscript" ? {
		...e,
		size: e.size * .65
	} : e;
}
function lr(e, t, n, r, i, a, o, s) {
	e.textAlign = "left", e.textBaseline = i;
	let c = s.needBidi ? gn(t, s.baseRtl ?? !1) : null, l = e, u = n;
	for (let n = 0; n < t.length; n++) {
		let f = c ? c.order[n] : n;
		if (c) try {
			l.direction = c.rtl[f] ? "rtl" : "ltr";
		} catch {}
		let p = t[f], m = cr(p.font);
		e.font = Yn(m, a);
		let h = s.fontColor ?? p.font.color;
		e.fillStyle = h ? J(h) : "#000000";
		let g = Jn(p.font.size, a), _ = 0;
		p.font.vertAlign === "superscript" ? _ = -Math.round(g * .35) : p.font.vertAlign === "subscript" && (_ = Math.round(g * .1)), e.fillText(p.text, u, r + _);
		let v = Jn(m.size, a);
		if (p.font.underline || p.font.strike) {
			let t = sr(i, r, v);
			if (p.font.underline) {
				let n = h ? J(h) : "#000000", r = p.font.underlineStyle === "double" || p.font.underlineStyle === "doubleAccounting";
				Qn(e, u, u + p.width, t.underline + _, n, r, o);
			}
			if (p.font.strike) {
				let n = t.strike + _, r = n + d(n, .5, o);
				e.save(), e.strokeStyle = h ? J(h) : "#000000", e.lineWidth = .5, e.beginPath(), e.moveTo(u, r), e.lineTo(u + p.width, r), e.stroke(), e.restore();
			}
		}
		u += p.width;
	}
	if (c) try {
		l.direction = "ltr";
	} catch {}
}
function ur(e, t, n, r, i, a, o, s, c) {
	let { alignH: l, cx: u, cellW: d, leftPad: f, paddingX: p } = r, m = t.map((t) => {
		let r = $n(n, t);
		return e.font = Yn(cr(r), i), {
			text: t.text,
			font: r,
			width: e.measureText(t.text).width
		};
	}), h = m.reduce((e, t) => e + t.width, 0), g;
	g = l === "right" ? u + d - p - h : l === "center" ? u + d / 2 - h / 2 : u + f;
	let { needBidi: _, baseRtl: v } = hn(o.readingOrder, m.map((e) => e.text).join(""));
	lr(e, m, g, s, c, i, a, {
		fontColor: o.fontColor,
		needBidi: _,
		baseRtl: v
	});
}
function dr(e, t, n, r, i, a, o = {}) {
	let { alignV: s, cy: c, cellH: l, paddingY: u } = r, d, f;
	s === "top" ? (f = "top", d = c + u) : s === "center" ? (f = "middle", d = c + l / 2) : (f = "bottom", d = c + l - u), ur(e, t, n, r, i, a, o, d, f);
}
function fr(e, t, n, r, i, a, o = {}) {
	let { alignV: s, cy: c, cellH: l, paddingY: u } = r, d = [[]];
	for (let e of t) {
		let t = e.text.split("\n");
		for (let n = 0; n < t.length; n++) n > 0 && d.push([]), t[n] !== "" && d[d.length - 1].push({
			...e,
			text: t[n]
		});
	}
	let f = n.size, p = n.name, m = d.map((e) => {
		if (e.length === 0) return {
			pt: f || On,
			family: p
		};
		let t = 0, r = null;
		for (let i of e) {
			let e = $n(n, i);
			e.size > t && (t = e.size, r = e.name), f = e.size, p = e.name;
		}
		return {
			pt: t,
			family: r
		};
	}).map((e) => Jn(e.pt, i, 1.2, e.family ?? void 0)), h = m.reduce((e, t) => e + t, 0), g;
	g = s === "top" ? c + u : s === "center" ? c + (l - h) / 2 : c + l - h - u;
	for (let t = 0; t < d.length; t++) {
		let s = d[t];
		s.length > 0 && ur(e, s, n, r, i, a, o, g, "top"), g += m[t];
	}
}
function pr(e, t, n, r, i, a, o = {}) {
	t.some((e) => e.text.includes("\n")) ? fr(e, t, n, r, i, a, o) : dr(e, t, n, r, i, a, o);
}
function mr(e, t, n, r, i, a, o = {}) {
	let { alignH: s, alignV: c, cx: l, cy: u, cellW: d, cellH: f, leftPad: p, paddingX: m, paddingY: h } = r, g = or(e, t, n, i, d - p - m), _ = g.reduce((e, t) => e + Jn(t.maxFontSize, i, 1.2, t.maxFontFamily ?? void 0), 0), v;
	v = c === "top" ? u + h : c === "center" ? u + (f - _) / 2 : u + f - _ - h;
	let y = t.map((e) => e.text).join("").split("\n").map((e) => hn(o.readingOrder, e));
	for (let t of g) {
		let n = t.segments.reduce((e, t) => e + t.width, 0), r;
		r = s === "right" ? l + d - m - n : s === "center" ? l + d / 2 - n / 2 : l + p;
		let { needBidi: c, baseRtl: u } = y[t.para];
		lr(e, t.segments, r, v, "top", i, a, {
			fontColor: o.fontColor,
			needBidi: c,
			baseRtl: u
		}), v += Jn(t.maxFontSize, i, 1.2, t.maxFontFamily ?? void 0);
	}
}
function hr(e) {
	let t = "";
	for (; e > 0;) {
		let n = (e - 1) % 26;
		t = String.fromCharCode(65 + n) + t, e = Math.floor((e - 1) / 26);
	}
	return t;
}
var gr = [
	"#FF0000",
	"#FFFF00",
	"#00B050"
], _r = [
	"#FF0000",
	"#FF6600",
	"#FFFF00",
	"#00B050"
], vr = [
	"#FF0000",
	"#FF6600",
	"#FFFF00",
	"#92D050",
	"#00B050"
];
function yr(e, t, n, r, i, a) {
	if (t === "NoIcons") return;
	let o = t || "3TrafficLights1", s = parseInt(o[0]) || 3, c = s === 5 ? vr : s === 4 ? _r : gr, l = c[Math.max(0, Math.min(n, c.length - 1))];
	if (e.save(), e.fillStyle = l, o.includes("Arrow")) {
		let t = a / 2;
		e.beginPath(), n === s - 1 ? (e.moveTo(r + t, i), e.lineTo(r + a, i + a), e.lineTo(r, i + a)) : n === 0 ? (e.moveTo(r, i), e.lineTo(r + a, i), e.lineTo(r + t, i + a)) : (e.moveTo(r, i + a * .3), e.lineTo(r + a, i + t), e.lineTo(r, i + a * .7)), e.closePath(), e.fill();
	} else o.includes("Flag") ? (e.beginPath(), e.moveTo(r, i), e.lineTo(r + a, i), e.lineTo(r, i + a), e.closePath(), e.fill()) : (e.beginPath(), e.arc(r + a / 2, i + a / 2, a / 2, 0, Math.PI * 2), e.fill());
	e.restore();
}
function br(e, t, n, r, i) {
	let a = Math.max(6, Math.round(Math.min(r, i) * .45)), o = t + r - a - 1, s = n + i - a - 1;
	e.save(), e.fillStyle = "#D0D0D0", e.fillRect(o, s, a, a), e.fillStyle = "#444444";
	let c = a * .55, l = o + (a - c) / 2, u = s + (a - c * .5) / 2;
	e.beginPath(), e.moveTo(l, u), e.lineTo(l + c, u), e.lineTo(l + c / 2, u + c * .5), e.closePath(), e.fill(), e.restore();
}
function xr(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.tables ?? []) {
		if (!n.styleName) continue;
		let { top: e, bottom: r, left: i, right: a } = n.range, o = n.accentColor || "#808080", s = !!n.isCustom, c = Math.max(0, n.headerRowCount ?? 1), l = Math.max(0, n.totalsRowCount ?? 0), u = e + c - 1, d = r - l + 1;
		for (let f = e; f <= r; f++) {
			let p = c > 0 && f <= u, m = l > 0 && f >= d, h = !p && !m ? f - u - 1 : -1, g = n.showRowStripes && h >= 0 ? h % 2 == 1 ? n.band1HorizontalDxf : n.band2HorizontalDxf : void 0;
			for (let c = i; c <= a; c++) t.set(`${f}:${c}`, {
				accent: o,
				isCustom: s,
				isHeader: p,
				isTotals: m,
				isBanded: n.showRowStripes && h >= 0 && h % 2 == 1,
				isFirstCol: n.showFirstColumn && c === i,
				isLastCol: n.showLastColumn && c === a,
				isTopEdge: f === e,
				isBottomEdge: f === r,
				wholeTableDxf: n.wholeTableDxf,
				headerRowDxf: n.headerRowDxf,
				totalRowDxf: n.totalRowDxf,
				firstColumnDxf: n.firstColumnDxf,
				lastColumnDxf: n.lastColumnDxf,
				stripeDxf: g
			});
		}
	}
	return t;
}
function Sr(e, t, n, r) {
	let i = t?.border?.horizontal, a = t?.border?.top, o = t?.border?.bottom, s = t?.border?.left, c = t?.border?.right, l = n?.border?.bottom, u = n?.border?.top;
	if (i || a || o || s || c || l || u) {
		let t = {
			left: null,
			right: null,
			top: null,
			bottom: null
		};
		return e.isTopEdge ? t.top = a ?? null : i && (t.top = i), e.isHeader && l ? t.bottom = l : e.isBottomEdge ? t.bottom = o ?? null : i && (t.bottom = i), (e.isFirstCol || r === 0) && (t.left = s ?? null), e.isLastCol && (t.right = c ?? null), {
			kind: "dxf",
			border: t
		};
	}
	return e.isCustom ? { kind: "none" } : {
		kind: "accent",
		color: e.accent,
		lineWidth: e.isHeader ? 1.5 : 1,
		topEdge: e.isTopEdge
	};
}
function Cr(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.sparklineGroups ?? []) {
		let e = Infinity, r = -Infinity;
		if (n.minAxisType === "group" || n.maxAxisType === "group") {
			for (let t of n.sparklines) for (let n of t.values) typeof n == "number" && (n < e && (e = n), n > r && (r = n));
			(!isFinite(e) || !isFinite(r)) && (e = 0, r = 1);
		}
		for (let i of n.sparklines) {
			let a = i.values.filter((e) => typeof e == "number"), o = a.length ? Math.min(...a) : 0, s = a.length ? Math.max(...a) : 1, c = n.minAxisType === "custom" && typeof n.manualMin == "number" ? n.manualMin : n.minAxisType === "group" ? e : o, l = n.maxAxisType === "custom" && typeof n.manualMax == "number" ? n.manualMax : n.maxAxisType === "group" ? r : s;
			t.set(`${i.row}:${i.col}`, {
				kind: n.kind,
				values: i.values,
				min: c,
				max: l,
				displayEmptyCellsAs: n.displayEmptyCellsAs === "zero" || n.displayEmptyCellsAs === "span" ? n.displayEmptyCellsAs : "gap",
				displayXAxis: n.displayXAxis,
				lineWeight: n.lineWeight,
				markers: n.markers,
				high: n.high,
				low: n.low,
				first: n.first,
				last: n.last,
				negative: n.negative,
				colorSeries: n.colorSeries,
				colorNegative: n.colorNegative,
				colorAxis: n.colorAxis,
				colorMarkers: n.colorMarkers,
				colorFirst: n.colorFirst,
				colorLast: n.colorLast,
				colorHigh: n.colorHigh,
				colorLow: n.colorLow
			});
		}
	}
	return t;
}
function wr(e) {
	let t = e.replace("#", "");
	if (t.length < 6) return "#F2F2F2";
	let n = parseInt(t.slice(0, 2), 16), r = parseInt(t.slice(2, 4), 16), i = parseInt(t.slice(4, 6), 16), a = (e) => Math.round(e * .2 + 255 * .8), o = (e) => e.toString(16).padStart(2, "0").toUpperCase();
	return `#${o(a(n))}${o(a(r))}${o(a(i))}`;
}
function Tr(e, t, n, r, a, o, s, c, l, u, f, p, m, h) {
	if (m <= 0 || h <= 0) return;
	let { styles: g, cellMap: _, mergeAnchorMap: v, mergeSkipSet: y, cfContext: b, cs: x, dpr: S } = t, C = a.length, w = o.length, T = (e, n) => t.rtl ? An(e, n, t.canvasW) : e, E = [], D = -s;
	for (let e = 0; e < C; e++) E.push(D), D += a[e];
	let O = [], ee = -c;
	for (let e = 0; e < w; e++) O.push(ee), ee += o[e];
	e.save(), e.beginPath(), e.rect(T(f, m), p, m, h), e.clip();
	let k = [], A = [], j = [];
	for (let i of t.worksheet.mergeCells ?? []) {
		let a = i.top, o = i.left;
		if (a >= n && a < n + w && o >= r && o < r + C || i.bottom < n || i.top >= n + w || i.right < r || i.left >= r + C) continue;
		let d = t.mergeAnchorMap.get(`${a}:${o}`);
		if (!d) continue;
		let f;
		if (o >= r) f = l + E[o - r];
		else {
			let e = 0;
			for (let n = o; n < r; n++) e += Math.round(Q(t.worksheet.colWidths[n] ?? t.worksheet.defaultColWidth, t.mdw) * x);
			f = l - s - e;
		}
		let p;
		if (a >= n) p = u + O[a - n];
		else {
			let e = 0;
			for (let r = a; r < n; r++) e += Math.round($(t.worksheet.rowHeights[r] ?? t.worksheet.defaultRowHeight) * x);
			p = u - c - e;
		}
		let m = d.totalW, h = d.totalH;
		f = T(f, m);
		let _ = `${a}:${o}`, v = t.cellMap.get(_), { font: y, fill: D, border: ee, xf: k } = er(g, v?.styleIndex ?? 0), j = fn(v, a, o, b, g.dxfs ?? []);
		if (Un(e, j.fill ?? D, f, p, m, h), j.dataBar && j.dataBar.ratio > 0) {
			let t = Math.max(0, (m - 4) * j.dataBar.ratio);
			Rn(e, j.dataBar.color, f + 2, p + 2, t, h - 4, j.dataBar.gradient);
		}
		let te = Kr(Gr(ee, a, o, d.right, d.bottom, t.cellMap, g), j.border);
		if (A.push(() => qr(e, te, f, p, m, h, S)), !v) continue;
		let M = xt(v, g, j.numFmt, t.worksheet.date1904), N = M.text;
		if (!N || N === "0" && t.worksheet.showZeros === !1) continue;
		let P = y.bold || !!j.fontBold, F = y.italic || !!j.fontItalic, I = y.underline || !!j.fontUnderline, L = y.strike || !!j.fontStrike, R = P !== y.bold || F !== y.italic || I !== y.underline || L !== y.strike ? {
			...y,
			bold: P,
			italic: F,
			underline: I,
			strike: L
		} : y;
		e.font = Yn(R, x);
		let z = t.hyperlinkMap.get(_) ? "#0563C1" : j.fontColor ?? M.color ?? y.color;
		e.fillStyle = z ? J(z) : "#000000";
		let B = v.value.type === "number", V = k.alignH ?? (B ? "right" : "left"), H = k.alignV ?? "bottom", U = k.indent ? Math.round(k.indent * 3 * t.mdw) : 0, ne = 3 + (V === "left" || !k.alignH ? U : 0);
		e.save(), e.beginPath(), e.rect(f, p, m, h), e.clip();
		let W;
		V === "right" ? (W = f + m - 3, e.textAlign = "right") : V === "center" ? (W = f + m / 2, e.textAlign = "center") : (W = f + ne, e.textAlign = "left");
		let re = v.value.type === "text" ? v.value.runs : void 0, ie = re && re.length > 0;
		if (k.wrapText && ie) mr(e, re, R, {
			alignH: V,
			alignV: H,
			cx: f,
			cy: p,
			cellW: m,
			cellH: h,
			leftPad: ne,
			paddingX: 3,
			paddingY: 2
		}, x, S, {
			fontColor: j.fontColor,
			readingOrder: k.readingOrder
		});
		else if (k.wrapText) {
			let t = tr(e, N, m - ne - 3), n = Jn(y.size, x, 1.2, y.name ?? void 0), r = t.length * n, i;
			i = H === "top" ? p + 2 : H === "center" ? p + (h - r) / 2 : p + h - r - 2, e.textBaseline = "top";
			for (let r = 0; r < t.length; r++) e.fillText(t[r], W, i + r * n);
		} else if (ie) pr(e, re, R, {
			alignH: V,
			alignV: H,
			cx: f,
			cy: p,
			cellW: m,
			cellH: h,
			leftPad: ne,
			paddingX: 3,
			paddingY: 2
		}, x, S, {
			fontColor: j.fontColor,
			readingOrder: k.readingOrder
		});
		else {
			let t;
			H === "top" ? (e.textBaseline = "top", t = p + 2) : H === "center" ? (e.textBaseline = "middle", t = p + h / 2) : (e.textBaseline = "bottom", t = p + h - 2), e.fillText(N, W, t);
		}
		e.restore();
	}
	for (let s = 0; s < w; s++) {
		let c = n + s, w = u + O[s], D = o[s];
		if (w + D <= p || w >= p + h) continue;
		let ee = /* @__PURE__ */ new Set(), te = /* @__PURE__ */ new Set(), M = -1, N = (e) => {
			if (M >= 0 && e - M >= 2) {
				for (let t = M; t < e - 1; t++) ee.add(t);
				for (let t = M + 1; t < e; t++) te.add(t);
			}
			M = -1;
		};
		for (let e = 0; e <= C; e++) {
			let t = !1, n = !1;
			if (e < C) {
				let i = `${c}:${r + e}`;
				if (!y.has(i) && !v.has(i)) {
					let e = _.get(i);
					t = er(g, e?.styleIndex ?? 0).xf.alignH === "centerContinuous", n = !!(e && e.value && e.value.type !== "empty");
				}
			}
			t ? n && M >= 0 && e > M ? (N(e), M = e) : M < 0 && (M = e) : N(e);
		}
		for (let n = 0; n < C; n++) {
			let o = r + n, u = l + E[n], p = a[n];
			if (u + p <= f || u >= f + m) continue;
			let h = `${c}:${o}`;
			if (y.has(h)) continue;
			let O = v.get(h), M = O ? O.totalW : p, N = O ? O.totalH : D, P = T(u, M), F = _.get(h), { font: L, fill: R, border: z, xf: B } = er(g, F?.styleIndex ?? 0), V = fn(F, c, o, b, g.dxfs ?? []), H = V.fill ?? R, U = t.tableStyleMap.get(h), ne = g.dxfs ?? [], W = (e) => e == null ? void 0 : ne[e], re = W(U?.wholeTableDxf), ie = W(U?.headerRowDxf), ae = W(U?.totalRowDxf), oe = W(U?.firstColumnDxf), se = W(U?.lastColumnDxf), ce = W(U?.stripeDxf), le = U?.isHeader && ie?.fill?.fgColor ? ie : U?.isTotals && ae?.fill?.fgColor ? ae : U?.isLastCol && se?.fill?.fgColor ? se : U?.isFirstCol && oe?.fill?.fgColor ? oe : ce?.fill?.fgColor ? ce : !U?.isHeader && !U?.isTotals && re?.fill?.fgColor ? re : void 0;
			if (Un(e, H, P, w, M, N) || (U && le?.fill?.fgColor ? (e.fillStyle = J(le.fill.fgColor), e.fillRect(P, w, M, N)) : U && !U.isCustom && U.isBanded && (e.fillStyle = wr(U.accent), e.fillRect(P, w, M, N))), t.commentCells.has(h) && Kn(e, P, w, M, N), V.dataBar && V.dataBar.ratio > 0) {
				let t = Math.max(0, (M - 4) * V.dataBar.ratio);
				Rn(e, V.dataBar.color, P + 2, w + 2, t, N - 4, V.dataBar.gradient);
			}
			let ue = t.sparklineMap.get(h);
			if (ue && De(e, {
				x: P,
				y: w,
				w: M,
				h: N
			}, ue), t.worksheet.showGridlines !== !1) {
				if (e.strokeStyle = "#d0d0d0", e.lineWidth = .5, e.beginPath(), !ee.has(n)) {
					let t = P + M + d(P + M, .5, S);
					e.moveTo(t, w), e.lineTo(t, w + N);
				}
				let t = w + N + d(w + N, .5, S);
				if (e.moveTo(P, t), e.lineTo(P + M, t), s === 0) {
					let t = w + d(w, .5, S);
					e.moveTo(P, t), e.lineTo(P + M, t);
				}
				if (n === 0) {
					let t = P + d(P, .5, S);
					e.moveTo(t, w), e.lineTo(t, w + N);
				}
				e.stroke();
			}
			let G = Kr(O ? Gr(z, c, o, O.right, O.bottom, _, g) : z, V.border);
			(ee.has(n) || te.has(n)) && (G = {
				...G,
				left: te.has(n) ? null : G.left,
				right: ee.has(n) ? null : G.right
			});
			let de = _.get(`${c - 1}:${o}`), fe = de ? er(g, de.styleIndex ?? 0).border.bottom : null;
			if (fe?.style && (s === 0 || G.top?.style) && (G = {
				...G,
				top: Zr(G.top, fe)
			}), !te.has(n)) {
				let e = _.get(`${c}:${o - 1}`), t = e ? er(g, e.styleIndex ?? 0).border.right : null;
				t?.style && (n === 0 || G.left?.style) && (G = {
					...G,
					left: Zr(G.left, t)
				});
			}
			let K = U ? Sr(U, re, ie, o) : null, pe = t.autoFilterCells.has(h), me = () => {
				if (K) {
					if (K.kind === "dxf") qr(e, K.border, P, w, M, N, S);
					else if (K.kind === "accent") {
						let t = .5 / S;
						if (e.strokeStyle = K.color, e.lineWidth = K.lineWidth, e.beginPath(), e.moveTo(P, w + N - t), e.lineTo(P + M, w + N - t), K.topEdge) {
							let t = w + d(w, K.lineWidth, S);
							e.moveTo(P, t), e.lineTo(P + M, t);
						}
						e.stroke();
					}
				}
				pe && br(e, P, w, p, N);
			};
			if (O) {
				let t = G;
				A.push(() => qr(e, t, P, w, M, N, S)), me();
			} else {
				let t = G;
				j.push(() => {
					qr(e, t, P, w, M, N, S), me();
				});
			}
			if (!F) continue;
			let he = xt(F, g, V.numFmt, t.worksheet.date1904), q = he.text;
			!q || q === "0" && t.worksheet.showZeros === !1 || k.push(() => {
				let s = U?.isHeader ? ie : U?.isTotals ? ae : U?.isLastCol && se ? se : U?.isFirstCol && oe ? oe : ce || (U ? re : void 0), l = U ? U.isCustom ? !!s?.font?.bold : U.isHeader || U.isTotals : !1, u = L.bold || !!V.fontBold || l, f = L.italic || !!V.fontItalic, p = L.underline || !!V.fontUnderline, m = L.strike || !!V.fontStrike, b = u !== L.bold || f !== L.italic || p !== L.underline || m !== L.strike ? {
					...L,
					bold: u,
					italic: f,
					underline: p,
					strike: m
				} : L;
				e.font = Yn(b, x);
				let T = t.hyperlinkMap.get(h), E = s?.font?.color ?? null, D = T ? "#0563C1" : V.fontColor ?? he.color ?? E ?? L.color;
				e.fillStyle = D ? J(D) : "#000000";
				let ee = F.value.type === "number", k = B.alignH ?? (ee ? "right" : "left"), A = B.alignV ?? "bottom", j = B.indent ? Math.round(B.indent * 3 * t.mdw) : 0, te = V.iconSet ? Math.max(8, Math.round(Math.min(M, N) * .55)) : 0, R = te > 0 ? te + 4 : 0, z = 3 + (k === "left" || !B.alignH ? j : 0) + R, H = M, ne = P, W = n;
				if (k === "centerContinuous" && !O) for (let e = n + 1; e < C; e++) {
					let t = `${c}:${r + e}`;
					if (y.has(t) || v.has(t)) break;
					let n = _.get(t);
					if (n && n.value.type !== "empty" || er(g, n?.styleIndex ?? 0).xf.alignH !== "centerContinuous") break;
					H += a[e], W = e;
				}
				let le = k === "centerContinuous" ? ne : P, ue = k === "centerContinuous" ? H : M, G = q.includes("\n");
				if (!O && !B.wrapText && !B.textRotation && !ee && !G) {
					let t = e.measureText(q).width, i = k === "centerContinuous", o = i ? t + 6 : t + z + 3, s = i ? H : M;
					if (o > s) {
						let e = o - s, t = 0, l = 0;
						if (k === "right" ? l = e : k === "center" || i ? (l = e / 2, t = e / 2) : t = e, t > 0) {
							let e = t, o = i ? W + 1 : n + 1;
							for (let t = o; t < C && e > 0; t++) {
								let n = `${c}:${r + t}`;
								if (y.has(n) || v.has(n)) break;
								let i = _.get(n);
								if (i && i.value.type !== "empty") break;
								ue += a[t], e -= a[t];
							}
						}
						if (l > 0) {
							let e = l;
							for (let t = n - 1; t >= 0 && e > 0; t--) {
								let n = `${c}:${r + t}`;
								if (y.has(n) || v.has(n)) break;
								let i = _.get(n);
								if (i && i.value.type !== "empty") break;
								le -= a[t], ue += a[t], e -= a[t];
							}
						}
					}
				}
				let de = q, fe = 0;
				if (k === "fill" && !ee && q.length > 0) {
					let t = Math.max(1, M - 6), n = e.measureText(q).width;
					if (n > 0 && n < t) {
						let e = Math.max(1, Math.floor(t / n));
						de = q.repeat(e);
					}
				}
				if (k === "distributed" || k === "justify" && !B.wrapText && !G) {
					let t = Math.max(1, M - 6), n = e.measureText(de).width, r = Math.max(1, [...de].length - 1);
					n < t && (fe = Math.max(0, (t - n) / r));
				}
				let K, pe;
				k === "right" ? (K = P + M - 3, pe = "right") : k === "center" ? (K = P + M / 2, pe = "center") : k === "centerContinuous" ? (K = ne + H / 2, pe = "center") : k === "distributed" || k === "justify" && !B.wrapText && !G ? (K = P + 3, pe = "left") : (K = P + z, pe = "left");
				let me = B.textRotation ?? 0, ge = me === 255, _e = me > 0 && me !== 255;
				if (V.iconSet && te > 0 && (e.save(), e.beginPath(), e.rect(P, w, M, N), e.clip(), yr(e, V.iconSet.name, V.iconSet.index, P + 2, w + (N - te) / 2, te), e.restore()), e.save(), e.beginPath(), e.rect(le, w, ue, N), e.clip(), ge) {
					let t = Jn(L.size, x, 1.1), n = [...q].length * t, r = A === "top" ? w + 2 : A === "center" ? w + (N - n) / 2 : w + N - n - 2;
					e.textAlign = "center", e.textBaseline = "top";
					for (let n of q) {
						let a = n.codePointAt(0) ?? 0, o = i(a) && I(e, a);
						yn(e, n, P + M / 2, r, t, o), r += t;
					}
					e.restore();
					return;
				}
				if (_e) {
					let t = me <= 90 ? -(me * Math.PI / 180) : (me - 90) * Math.PI / 180;
					e.translate(P + M / 2, w + N / 2), e.rotate(t), e.textAlign = "center", e.textBaseline = "middle", e.fillText(q, 0, 0), e.restore();
					return;
				}
				if (B.shrinkToFit) {
					let t = e.measureText(q).width, n = M - z - 3;
					if (t > n && t > 0) {
						let r = n / t, i = k === "right" ? P + M - 3 : k === "center" ? P + M / 2 : P + z;
						e.transform(r, 0, 0, 1, i * (1 - r), 0);
					}
				}
				if (e.textAlign = pe, fe > 0) try {
					e.letterSpacing = `${fe}px`;
				} catch {}
				try {
					e.direction = pn(B.readingOrder, q) ? "rtl" : "ltr";
				} catch {}
				let ve = F.value.type === "text" ? F.value.runs : void 0, ye = ve && ve.length > 0;
				if (B.wrapText && ye) mr(e, ve, b, {
					alignH: k,
					alignV: A,
					cx: P,
					cy: w,
					cellW: M,
					cellH: N,
					leftPad: z,
					paddingX: 3,
					paddingY: 2
				}, x, S, {
					fontColor: V.fontColor,
					readingOrder: B.readingOrder
				});
				else if (B.wrapText) {
					let t = tr(e, q, M - z - 3), n = Jn(L.size, x, 1.2, L.name ?? void 0), r = t.length * n, i;
					A === "top" ? (i = w + 2, e.textBaseline = "top") : A === "center" ? (i = w + (N - r) / 2, e.textBaseline = "top") : (i = w + N - r - 2, e.textBaseline = "top");
					for (let r = 0; r < t.length; r++) e.fillText(t[r], K, i + r * n);
				} else if (ye) pr(e, ve, b, {
					alignH: k,
					alignV: A,
					cx: P,
					cy: w,
					cellW: M,
					cellH: N,
					leftPad: z,
					paddingX: 3,
					paddingY: 2
				}, x, S, {
					fontColor: V.fontColor,
					readingOrder: B.readingOrder
				});
				else {
					let t = b.vertAlign, n = Jn(L.size, x), r = 0;
					t === "superscript" ? r = -Math.round(n * .35) : t === "subscript" && (r = Math.round(n * .1));
					let i = t ? {
						...b,
						size: b.size * .65
					} : b;
					t && (e.font = Yn(i, x));
					let a = null, o = () => a ??= e.measureText(q), s = () => {
						let e = Math.min(o().width, ue - z - 3);
						return {
							x: k === "right" ? P + M - 3 - e : k === "center" ? P + M / 2 - e / 2 : P + z,
							width: e
						};
					}, c = Jn(i.size, x);
					if (b.underline || T) {
						let { x: t, width: n } = s(), i = (A === "top" ? w + 2 + c + 1 : A === "center" ? w + N / 2 + Math.round(c * .55) : w + N - 2 + 1) + r, a = T ? "#0563C1" : D ? J(D) : "#000000", o = b.underlineStyle === "double" || b.underlineStyle === "doubleAccounting";
						Qn(e, t, t + n, i, a, o, S);
					}
					if (b.strike) {
						let { x: t, width: n } = s(), i = (A === "top" ? w + 2 + Math.round(c * .5) : A === "center" ? w + N / 2 : w + N - 2 - Math.round(c * .35)) + r, a = i + d(i, .5, S);
						e.save(), e.strokeStyle = D ? J(D) : "#000000", e.lineWidth = .5, e.beginPath(), e.moveTo(t, a), e.lineTo(t + n, a), e.stroke(), e.restore();
					}
					if (q.includes("\n")) {
						let t = q.split("\n"), n = Jn(L.size, x, 1.2, L.name ?? void 0), i = t.length * n, a;
						A === "top" ? (a = w + 2, e.textBaseline = "top") : A === "center" ? (a = w + (N - i) / 2, e.textBaseline = "top") : (a = w + N - i - 2, e.textBaseline = "top");
						for (let i = 0; i < t.length; i++) e.fillText(t[i], K, a + i * n + r);
					} else {
						let t;
						A === "top" ? (e.textBaseline = "top", t = w + 2) : A === "center" ? (e.textBaseline = "middle", t = w + N / 2) : (e.textBaseline = "bottom", t = w + N - 2), e.fillText(de, K, t + r);
					}
				}
				let be = F.value.type === "text" ? F.value.phoneticRuns : void 0;
				if (F.showPhonetic && be && be.length > 0 && !q.includes("\n")) {
					let t = Yn(b, x), n = Zn(e, q, t), r;
					r = k === "right" ? P + M - 3 - n : k === "center" ? P + M / 2 - n / 2 : P + z;
					let i = D ? J(D) : "#000000";
					Xn(e, be, F.value.type === "text" ? F.value.phoneticPr : void 0, q, t, g, r, w, x, i);
				}
				e.restore(), q && t.onTextRun && t.onTextRun({
					sheetName: t.worksheet.name,
					cellRef: vn(c, o),
					text: q,
					x: P,
					y: w,
					width: M,
					height: N,
					row: c,
					col: o
				});
			});
		}
	}
	for (let e of j) e();
	for (let e of A) e();
	for (let e of k) e();
	e.restore();
}
var Er = /* @__PURE__ */ new WeakMap();
function Dr(e) {
	let t = Er.get(e);
	if (t) return t;
	let n = /* @__PURE__ */ new Map();
	for (let t of e.rows) for (let e of t.cells) n.set(`${e.row}:${e.col}`, e);
	let r = /* @__PURE__ */ new Set();
	for (let t of e.mergeCells ?? []) for (let e = t.top; e <= t.bottom; e++) for (let n = t.left; n <= t.right; n++) e === t.top && n === t.left || r.add(`${e}:${n}`);
	let i = /* @__PURE__ */ new Set();
	if (e.autoFilter) {
		let t = e.autoFilter;
		for (let e = t.left; e <= t.right; e++) i.add(`${t.top}:${e}`);
	}
	let a = /* @__PURE__ */ new Map();
	for (let t of e.hyperlinks ?? []) t.url && a.set(`${t.row}:${t.col}`, t.url);
	let o = /* @__PURE__ */ new Set();
	for (let t of e.commentRefs ?? []) {
		let e = Gn(t);
		e && o.add(`${e.row}:${e.col}`);
	}
	let s = {
		cellMap: n,
		cfContext: an(e),
		mergeSkipSet: r,
		autoFilterCells: i,
		hyperlinkMap: a,
		commentCells: o,
		tableStyleMap: xr(e),
		sparklineMap: Cr(e)
	};
	return Er.set(e, s), s;
}
function Or(e, t, n, r, i = {}) {
	let a = i.dpr ?? 1, o = i.cellScale ?? 1, s = Z(t), c = e.canvas.width / a, l = e.canvas.height / a;
	e.clearRect(0, 0, c, l), e.fillStyle = "#ffffff", e.fillRect(0, 0, c, l);
	let u = (e) => Math.round(e * o), f = u(50), p = u(22), { row: m, col: h, rows: g, cols: _ } = r, v = (i.scrollOffsetX ?? 0) * o, y = (i.scrollOffsetY ?? 0) * o, b = i.freezeRows ?? 0, x = i.freezeCols ?? 0, S = [];
	for (let e = 1; e <= x; e++) S.push(u(Q(t.colWidths[e] ?? t.defaultColWidth, s)));
	let C = [];
	for (let e = 1; e <= b; e++) C.push(u($(t.rowHeights[e] ?? t.defaultRowHeight)));
	let w = S.reduce((e, t) => e + t, 0), T = C.reduce((e, t) => e + t, 0), E = [];
	for (let e = h; e < h + _; e++) E.push(u(Q(t.colWidths[e] ?? t.defaultColWidth, s)));
	let D = [];
	for (let e = m; e < m + g; e++) D.push(u($(t.rowHeights[e] ?? t.defaultRowHeight)));
	let { cellMap: O, cfContext: ee, mergeSkipSet: k, autoFilterCells: A, hyperlinkMap: j, commentCells: te, tableStyleMap: M, sparklineMap: N } = Dr(t), P = /* @__PURE__ */ new Map();
	for (let e of t.mergeCells ?? []) {
		let n = 0;
		for (let r = e.left; r <= e.right; r++) n += u(Q(t.colWidths[r] ?? t.defaultColWidth, s));
		let r = 0;
		for (let n = e.top; n <= e.bottom; n++) r += u($(t.rowHeights[n] ?? t.defaultRowHeight));
		P.set(`${e.top}:${e.left}`, {
			totalW: n,
			totalH: r,
			right: e.right,
			bottom: e.bottom
		});
	}
	let F = {
		worksheet: t,
		styles: n,
		cellMap: O,
		mergeAnchorMap: P,
		mergeSkipSet: k,
		cfContext: ee,
		colWidths: E,
		rowHeights: D,
		frozenColWidths: S,
		frozenRowHeights: C,
		frozenW: w,
		frozenH: T,
		startRow: m,
		startCol: h,
		cs: o,
		dpr: a,
		autoFilterCells: A,
		hyperlinkMap: j,
		commentCells: te,
		tableStyleMap: M,
		sparklineMap: N,
		mdw: s,
		onTextRun: i.onTextRun,
		rtl: t.rightToLeft === !0,
		canvasW: c
	}, I = f, L = p, R = I + w, z = L + T, B = Math.max(0, c - R), V = Math.max(0, l - z);
	b > 0 && x > 0 && Tr(e, F, 1, 1, S, C, 0, 0, I, L, I, L, w, T), b > 0 && Tr(e, F, 1, h, E, C, v, 0, R, L, R, L, B, T), x > 0 && Tr(e, F, m, 1, S, D, 0, y, I, z, I, z, w, V), Tr(e, F, m, h, E, D, v, y, R, z, R, z, B, V), t.images && t.images.length > 0 && i.loadedImages && Mr(e, t, i.loadedImages, o, m, h, v, y, R, z, B, V, t.rightToLeft === !0, c), t.shapeGroups && t.shapeGroups.length > 0 && Nr(e, t, o, m, h, v, y, R, z, B, V, i.loadedImages, t.rightToLeft === !0, c), t.charts && t.charts.length > 0 && Qr(e, t, o, m, h, v, y, R, z, B, V, t.rightToLeft === !0, c), t.slicers && t.slicers.length > 0 && di(e, t, o, m, h, v, y, R, z, B, V, t.rightToLeft === !0, c), kr(e, c, l, m, h, g, _, E, D, v, y, S, C, w, T, f, p, o, a, i.selectedRowRange ?? null, i.selectedColRange ?? null, t.rightToLeft === !0);
	let H = t.rightToLeft === !0;
	if (b > 0) {
		e.save(), e.strokeStyle = Mn, e.lineWidth = .5, e.beginPath();
		let t = z + d(z, .5, a);
		H ? (e.moveTo(0, t), e.lineTo(c - f, t)) : (e.moveTo(f, t), e.lineTo(c, t)), e.stroke(), e.restore();
	}
	if (x > 0) {
		e.save(), e.strokeStyle = Mn, e.lineWidth = .5, e.beginPath();
		let t = H ? c - R : R, n = t + d(t, .5, a);
		e.moveTo(n, p), e.lineTo(n, l), e.stroke(), e.restore();
	}
}
function kr(e, t, n, r, i, a, o, s, c, l, u, f, p, m, h, g, _, v, y, b, x, S) {
	let C = "#f8f9fa", w = "#e8eaed", T = "#caddf6", E = "#c8ccd0", D = "#5b9bd5", O = "#444", ee = (e) => !x || e < x.start || e > x.end ? C : x.strong ? T : w, k = (e) => !x || e < x.start || e > x.end ? E : x.strong ? D : E, A = (e) => !b || e < b.start || e > b.end ? C : b.strong ? T : w, j = (e) => !b || e < b.start || e > b.end ? E : b.strong ? D : E, te = `${Math.max(1, Math.round(11 * v))}px ${Cn}`, M = g + m, N = _ + h, P = .5 / y, F = (e, n) => S ? An(e, n, t) : e, I = S ? t - g : 0;
	e.fillStyle = C, e.fillRect(I, 0, g, _), e.strokeStyle = E, e.lineWidth = .5, e.beginPath();
	let L = I + d(I, .5, y), R = d(0, .5, y);
	e.moveTo(L, 0), e.lineTo(L, _), e.moveTo(I, R), e.lineTo(I + g, R), e.moveTo(I + g - P, 0), e.lineTo(I + g - P, _), e.moveTo(I, _ - P), e.lineTo(I + g, _ - P), e.stroke(), e.font = te, e.fillStyle = O;
	let z = (t, n, r) => {
		let i = F(n, r);
		e.fillStyle = ee(t), e.fillRect(i, 0, r, _), e.strokeStyle = k(t), e.lineWidth = .5, e.beginPath();
		let a = i + d(i, .5, y), o = d(0, .5, y);
		e.moveTo(a, 0), e.lineTo(a, _), e.moveTo(i, _ - P), e.lineTo(i + r, _ - P), e.moveTo(i, o), e.lineTo(i + r, o), e.stroke(), e.fillStyle = O, e.textAlign = "center", e.textBaseline = "middle", e.fillText(hr(t), i + r / 2, _ / 2);
	}, B = (t, n, r) => {
		let i = I;
		e.fillStyle = A(t), e.fillRect(i, n, g, r), e.strokeStyle = j(t), e.lineWidth = .5, e.beginPath();
		let a = n + d(n, .5, y), o = i + d(i, .5, y);
		e.moveTo(i + g - P, n), e.lineTo(i + g - P, n + r), e.moveTo(i, a), e.lineTo(i + g, a), e.moveTo(o, n), e.lineTo(o, n + r), e.stroke(), e.fillStyle = O, e.textBaseline = "middle";
		let s = Math.max(2, Math.round(4 * v));
		S ? (e.textAlign = "left", e.fillText(String(t), i + s, n + r / 2)) : (e.textAlign = "right", e.fillText(String(t), i + g - s, n + r / 2));
	};
	if (f.length > 0) {
		e.save(), e.beginPath(), e.rect(F(g, m), 0, m, _), e.clip();
		let t = g;
		for (let e = 0; e < f.length; e++) z(e + 1, t, f[e]), t += f[e];
		e.restore();
	}
	e.save(), e.beginPath(), e.rect(F(M, t - M), 0, t - M, _), e.clip();
	let V = M - l;
	for (let e = 0; e < s.length; e++) {
		let n = s[e];
		V + n > M && V < t && z(i + e, V, n), V += n;
	}
	if (e.restore(), p.length > 0) {
		e.save(), e.beginPath(), e.rect(I, _, g, h), e.clip();
		let t = _;
		for (let e = 0; e < p.length; e++) B(e + 1, t, p[e]), t += p[e];
		e.restore();
	}
	e.save(), e.beginPath(), e.rect(I, N, g, n - N), e.clip();
	let H = N - u;
	for (let e = 0; e < c.length; e++) {
		let t = c[e];
		H + t > N && H < n && B(r + e, H, t), H += t;
	}
	e.restore();
}
function Ar(e, t, n) {
	let r = Z(e), i = 0;
	for (let a = 1; a < t; a++) i += Math.round(Q(e.colWidths[a] ?? e.defaultColWidth, r) * n);
	return i;
}
function jr(e, t, n) {
	let r = 0;
	for (let i = 1; i < t; i++) r += Math.round($(e.rowHeights[i] ?? e.defaultRowHeight) * n);
	return r;
}
function Mr(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
	if (u <= 0 || d <= 0) return;
	let m = Ar(t, a, r), h = jr(t, i, r);
	e.save(), e.beginPath();
	let g = jn(c, u, p, f);
	e.rect(g, l, u, d), e.clip();
	for (let i of t.images) {
		let a = n.get(bn(i.imagePath, i.duotone));
		if (!a) continue;
		let _ = i.fromCol + 1, v = i.fromRow + 1, y = Ar(t, _, r) + i.fromColOff * r / W, b = jr(t, v, r) + i.fromRowOff * r / W, x, S;
		if (i.editAs === "oneCell" && i.nativeExtCx > 0 && i.nativeExtCy > 0) x = i.nativeExtCx * r / W, S = i.nativeExtCy * r / W;
		else {
			let e = i.toCol + 1, n = i.toRow + 1, a = Ar(t, e, r) + i.toColOff * r / W, o = jr(t, n, r) + i.toRowOff * r / W;
			x = a - y, S = o - b;
		}
		if (x <= 0 || S <= 0) continue;
		let C = jn(c + (y - m) - o, x, p, f), w = l + (b - h) - s;
		C + x < g || C > g + u || w + S < l || w > l + d || (i.alpha != null && i.alpha < 1 ? (e.save(), e.globalAlpha = i.alpha, V(e, a, i.srcRect, C, w, x, S), e.restore()) : V(e, a, i.srcRect, C, w, x, S));
	}
	e.restore();
}
function Nr(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
	if (l <= 0 || u <= 0) return;
	let m = t.shapeGroups;
	if (!m || m.length === 0) return;
	let h = Ar(t, i, n), g = jr(t, r, n);
	e.save(), e.beginPath();
	let _ = jn(s, l, p, f);
	e.rect(_, c, l, u), e.clip();
	for (let r of m) {
		let i = r.fromCol + 1, m = r.fromRow + 1, v = Ar(t, i, n) + r.fromColOff * n / W, y = jr(t, m, n) + r.fromRowOff * n / W, b, x;
		if (r.editAs === "oneCell" && r.nativeExtCx > 0 && r.nativeExtCy > 0) b = r.nativeExtCx * n / W, x = r.nativeExtCy * n / W;
		else {
			let e = r.toCol + 1, i = r.toRow + 1, a = Ar(t, e, n) + r.toColOff * n / W, o = jr(t, i, n) + r.toRowOff * n / W;
			b = a - v, x = o - y;
		}
		if (b <= 0 || x <= 0) continue;
		let S = jn(s + (v - h) - a, b, p, f), C = c + (y - g) - o;
		if (!(S + b < _ || S > _ + l) && !(C + x < c || C > c + u)) for (let t of r.shapes) {
			let r = S + t.x * b, i = C + t.y * x, a = t.w * b, o = t.h * x;
			a <= 0 || o <= 0 || Pr(e, t, r, i, a, o, n, d);
		}
	}
	e.restore();
}
function Pr(e, t, n, r, i, a, o, s) {
	if (e.save(), t.rot !== 0 || t.flipH || t.flipV ? (e.translate(n + i / 2, r + a / 2), e.rotate(t.rot * Math.PI / 180), e.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1), e.translate(-i / 2, -a / 2)) : e.translate(n, r), t.geom.type === "custom") for (let n of t.geom.paths) {
		if (n.w <= 0 || n.h <= 0) continue;
		let r = i / n.w, o = a / n.h;
		e.beginPath();
		let s = 0, c = 0, l = 0, u = 0;
		for (let t of n.commands) switch (t.op) {
			case "moveTo": {
				let n = t.x * r, i = t.y * o;
				e.moveTo(n, i), s = l = n, c = u = i;
				break;
			}
			case "lineTo": {
				let n = t.x * r, i = t.y * o;
				e.lineTo(n, i), s = n, c = i;
				break;
			}
			case "cubicBezTo": {
				let n = t.x3 * r, i = t.y3 * o;
				e.bezierCurveTo(t.x1 * r, t.y1 * o, t.x2 * r, t.y2 * o, n, i), s = n, c = i;
				break;
			}
			case "quadBezTo": {
				let n = t.x2 * r, i = t.y2 * o;
				e.quadraticCurveTo(t.x1 * r, t.y1 * o, n, i), s = n, c = i;
				break;
			}
			case "arcTo": {
				let n = t.wr * r, i = t.hr * o;
				if (n <= 0 || i <= 0) break;
				let a = t.stAng / 6e4 * (Math.PI / 180), l = t.swAng / 6e4 * (Math.PI / 180), u = s - Math.cos(a) * n, d = c - Math.sin(a) * i, f = a + l;
				e.ellipse(u, d, n, i, 0, a, f, l < 0), s = u + Math.cos(f) * n, c = d + Math.sin(f) * i;
				break;
			}
			case "close":
				e.closePath(), s = l, c = u;
				break;
		}
		Wr(e, t);
	}
	else if (t.geom.type === "preset") {
		let n = t.fillColor ?? null, r = t.strokeColor && t.strokeWidth > 0 ? () => {
			e.strokeStyle = t.strokeColor, e.lineWidth = Math.max(.5, t.strokeWidth / W), e.stroke();
		} : null;
		ce(e, t.geom.name, 0, 0, i, a, t.geom.adj ?? [], n, r, () => {}) || (e.beginPath(), e.rect(0, 0, i, a), Wr(e, t));
	} else if (t.geom.type === "image") {
		let n = s?.get(bn(t.geom.imagePath, t.geom.duotone));
		if (n) {
			let r = t.geom.alpha;
			r != null && r < 1 ? (e.save(), e.globalAlpha = r, V(e, n, t.geom.srcRect, 0, 0, i, a), e.restore()) : V(e, n, t.geom.srcRect, 0, 0, i, a);
		}
	}
	t.text && Ur(e, t.text, i, a, o), e.restore();
}
var Fr = /* @__PURE__ */ new WeakMap();
function Ir(e, t) {
	let n = e.tinted.get(t);
	if (n) return n;
	let r = e.img.naturalWidth || 1, i = e.img.naturalHeight || 1, a = document.createElement("canvas");
	a.width = r, a.height = i;
	let o = a.getContext("2d");
	return o ? (o.drawImage(e.img, 0, 0, r, i), o.globalCompositeOperation = "source-in", o.fillStyle = t, o.fillRect(0, 0, r, i), e.tinted.set(t, a), a) : e.img;
}
function Lr(e) {
	let t = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(e)}`, n = new Image();
	return new Promise((e, r) => {
		n.onload = () => e(n), n.onerror = r, n.src = t;
	});
}
var Rr = 256;
function zr(e, t, n) {
	let r = Math.max(1, Math.round(t * Rr)), i = Math.max(1, Math.round(n * Rr));
	return e.replace(/<svg([^>]*?)>/, (e, t) => `<svg${t.replace(/\s(?:width|height)="[^"]*"/g, "")} width="${r}" height="${i}">`);
}
function Br(e) {
	let t = [];
	for (let n of e.shapeGroups ?? []) for (let e of n.shapes) for (let n of e.text?.paragraphs ?? []) for (let e of n.runs) e.type === "math" && t.push({
		nodes: e.nodes,
		display: e.display
	});
	return t;
}
function Vr(e) {
	for (let t of e.shapeGroups ?? []) for (let e of t.shapes) for (let t of e.text?.paragraphs ?? []) for (let e of t.runs) if (e.type === "math" && !Fr.has(e.nodes)) return !0;
	return !1;
}
async function Hr(e, t) {
	let n = Br(e).filter((e) => !Fr.has(e.nodes));
	if (n.length !== 0) {
		await t.loadMathJax();
		for (let e of n) if (!Fr.has(e.nodes)) try {
			let n = await t.mathMLToSvg(h(e.nodes, e.display)), r = await Lr(zr(Ee(n.svg, "#000000"), n.widthEm, n.ascentEm + n.descentEm));
			Fr.set(e.nodes, {
				img: r,
				widthEm: n.widthEm,
				ascentEm: n.ascentEm,
				descentEm: n.descentEm,
				tinted: /* @__PURE__ */ new Map()
			});
		} catch {}
	}
}
function Ur(e, t, n, r, i) {
	if (n <= 0 || r <= 0 || t.paragraphs.length === 0) return;
	let a = t.lIns / W * i, o = t.rIns / W * i, s = t.tIns / W * i, c = t.bIns / W * i, l = Math.max(0, n - a - o), u = Math.max(0, r - s - c);
	if (l <= 0 || u <= 0) return;
	let d = (e) => {
		let t = (e.size > 0 ? e.size : On) * x * i, n = Dn(e.fontFace);
		return {
			font: `${e.italic ? "italic " : ""}${e.bold ? "bold " : ""}${t}px ${n}`,
			px: t
		};
	}, f = (t, n) => {
		let r = e.font;
		e.font = t;
		let i = e.measureText("M").actualBoundingBoxAscent;
		return e.font = r, i > 0 ? i : n * .85;
	}, p = t.wrap !== "none", m = [];
	for (let n of t.paragraphs) {
		let r = n.align || "l", a = (n.marL ?? 0) / W * i, o = (n.marR ?? 0) / W * i, s = (n.indent ?? 0) / W * i, c = Math.max(0, s), u = Math.max(0, l - a - o), h = !1, g = () => h ? a : a + c, _ = () => h ? u : u - c, v = [], y = 0, b = 0, S = 0, C = !1, w = (e) => {
			let r = e;
			return n.spaceLine && (n.spaceLine.type === "pct" ? r *= n.spaceLine.val / 1e5 : r = n.spaceLine.val * x * i), t.autoFit === "norm" && t.lnSpcReduction != null && n.spaceLine?.type !== "pts" && (r *= 1 - t.lnSpcReduction), r;
		}, T = () => {
			if (b === 0) {
				let e = (E || On) * x * i, t = Math.max(G(D, e), G(O, e));
				b = Math.max(e * 1.2, t), S = f(`${e}px ${Dn(D)}`, e);
			}
			b = w(b), m.push({
				segs: v,
				align: r,
				height: b,
				ascent: S,
				hasMath: C,
				leftInset: g(),
				availW: _()
			}), h = !0, v = [], y = 0, b = 0, S = 0, C = !1;
		}, E = 0, D, O;
		for (let t of n.runs) {
			if (t.type === "break") {
				T();
				continue;
			}
			if (t.type === "math") {
				let e = Fr.get(t.nodes);
				if (!e) continue;
				let n = (t.fontSize ?? (E || On)) * x * i, o = e.widthEm * n, s = e.ascentEm * n, c = e.descentEm * n, l = t.color ?? "#000000";
				if (t.display) {
					T(), m.push({
						segs: [{
							kind: "math",
							render: e,
							color: l,
							w: o,
							ascent: s,
							descent: c
						}],
						align: r,
						height: w(s + c),
						ascent: s,
						hasMath: !0,
						leftInset: a,
						availW: u
					}), h = !0;
					continue;
				}
				p && y + o > _() && v.length > 0 && T(), v.push({
					kind: "math",
					render: e,
					color: l,
					w: o,
					ascent: s,
					descent: c
				}), y += o, b = Math.max(b, s + c), S = Math.max(S, s), C = !0;
				continue;
			}
			E = t.size > 0 ? t.size : On, D = t.fontFace, O = t.fontFaceEa;
			let { font: n, px: o } = d(t), s = t.color ?? "#000000", c = Math.max(G(t.fontFace, o), G(t.fontFaceEa, o)), l = Math.max(o * 1.2, c);
			b = Math.max(b, l), S = Math.max(S, f(n, o)), e.font = n;
			let g = t.text.split("\n");
			for (let t = 0; t < g.length; t++) {
				t > 0 && T();
				let r = g[t];
				if (!r) continue;
				if (!p) {
					let t = e.measureText(r).width;
					v.push({
						kind: "text",
						text: r,
						font: n,
						color: s,
						w: t
					}), y += t;
					continue;
				}
				let i = "";
				for (let t of r) {
					let r = i + t, a = e.measureText(r).width;
					if (y + a > _() && (i.length > 0 || v.length > 0)) {
						if (i) {
							let t = e.measureText(i).width;
							v.push({
								kind: "text",
								text: i,
								font: n,
								color: s,
								w: t
							}), y += t;
						}
						T(), i = t, e.font = n, b = Math.max(b, l), S = Math.max(S, f(n, o));
					} else i = r;
				}
				if (i) {
					let t = e.measureText(i).width;
					v.push({
						kind: "text",
						text: i,
						font: n,
						color: s,
						w: t
					}), y += t;
				}
			}
		}
		T();
	}
	let h = m.reduce((e, t) => e + t.height, 0), g = s;
	t.anchor === "ctr" ? g = s + (u - h) / 2 : t.anchor === "b" && (g = s + Math.max(0, u - h));
	let _ = g;
	for (let t of m) {
		let n = t.segs.reduce((e, t) => e + t.w, 0), r = a + t.leftInset, i = r;
		if (t.align === "ctr" ? i = r + Math.max(0, (t.availW - n) / 2) : t.align === "r" && (i = r + Math.max(0, t.availW - n)), t.hasMath) {
			e.textBaseline = "alphabetic";
			let n = _ + t.ascent;
			for (let r of t.segs) {
				if (r.kind === "text") e.font = r.font, e.fillStyle = r.color, e.fillText(r.text, i, n);
				else {
					let t = Ir(r.render, r.color);
					e.drawImage(t, i, n - r.ascent, r.w, r.ascent + r.descent);
				}
				i += r.w;
			}
		} else {
			e.textBaseline = "middle";
			let n = _ + t.height / 2;
			for (let r of t.segs) r.kind === "text" && (e.font = r.font, e.fillStyle = r.color, e.fillText(r.text, i, n)), i += r.w;
		}
		_ += t.height;
	}
}
function Wr(e, t) {
	t.fillColor && (e.fillStyle = t.fillColor, e.fill()), t.strokeColor && t.strokeWidth > 0 && (e.strokeStyle = t.strokeColor, e.lineWidth = Math.max(.5, t.strokeWidth / W), e.stroke());
}
function Gr(e, t, n, r, i, a, o) {
	if (r === n && i === t) return e;
	let s = (e, r) => {
		if (e === t && r === n) return null;
		let i = a.get(`${e}:${r}`);
		return i ? er(o, i.styleIndex ?? 0).border : null;
	}, c = s(t, r), l = s(i, n), u = s(i, r), d = (e, ...t) => {
		if (e?.style) return e;
		for (let e of t) if (e?.style) return e;
		return e ?? null;
	};
	return {
		left: e.left,
		top: e.top,
		right: d(c?.right, u?.right, e.right),
		bottom: d(l?.bottom, u?.bottom, e.bottom),
		diagonalUp: e.diagonalUp ?? null,
		diagonalDown: e.diagonalDown ?? null
	};
}
function Kr(e, t) {
	if (!t) return e;
	let n = (e, t) => t && t.style ? t : e ?? null;
	return {
		left: n(e.left, t.left),
		right: n(e.right, t.right),
		top: n(e.top, t.top),
		bottom: n(e.bottom, t.bottom),
		diagonalUp: n(e.diagonalUp, t.diagonalUp),
		diagonalDown: n(e.diagonalDown, t.diagonalDown)
	};
}
function qr(e, t, n, r, i, a, o = 1) {
	let s = [
		{
			edge: t.top,
			x1: n,
			y1: r,
			x2: n + i,
			y2: r,
			kind: "h"
		},
		{
			edge: t.bottom,
			x1: n,
			y1: r + a,
			x2: n + i,
			y2: r + a,
			kind: "h"
		},
		{
			edge: t.left,
			x1: n,
			y1: r,
			x2: n,
			y2: r + a,
			kind: "v"
		},
		{
			edge: t.right,
			x1: n + i,
			y1: r,
			x2: n + i,
			y2: r + a,
			kind: "v"
		},
		{
			edge: t.diagonalUp,
			x1: n,
			y1: r + a,
			x2: n + i,
			y2: r,
			kind: "d"
		},
		{
			edge: t.diagonalDown,
			x1: n,
			y1: r,
			x2: n + i,
			y2: r + a,
			kind: "d"
		}
	];
	for (let { edge: t, x1: c, y1: l, x2: u, y2: f, kind: p } of s) {
		if (!t || !t.style || t.style === "none") continue;
		let s = t.color ? J(t.color) : "#000000";
		if (t.style === "double" && p === "d") {
			e.strokeStyle = s, e.lineWidth = 1, e.setLineDash([]);
			let t = u - c, n = f - l, r = Math.hypot(t, n), i = -n / r * 1, a = t / r * 1;
			e.beginPath(), e.moveTo(c + i, l + a), e.lineTo(u + i, f + a), e.moveTo(c - i, l - a), e.lineTo(u - i, f - a), e.stroke();
			continue;
		}
		if (t.style === "double" && p !== "d") {
			if (e.strokeStyle = s, e.lineWidth = 1, e.setLineDash([]), e.beginPath(), p === "h") {
				let t = l === r, o = t ? r - 1 : r + a + 1, s = t ? r + 1 : r + a - 1;
				e.moveTo(n - 1, o), e.lineTo(n + i + 1, o), e.moveTo(n + 1, s), e.lineTo(n + i - 1, s);
			} else {
				let t = c === n, o = t ? n - 1 : n + i + 1, s = t ? n + 1 : n + i - 1;
				e.moveTo(o, r - 1), e.lineTo(o, r + a + 1), e.moveTo(s, r + 1), e.lineTo(s, r + a - 1);
			}
			e.stroke();
			continue;
		}
		e.beginPath(), e.strokeStyle = s;
		let m = Jr(t.style);
		e.lineWidth = m;
		let h = Yr(t.style);
		e.setLineDash(h);
		let g = p === "v" ? d(c, m, o) : 0, _ = p === "h" ? d(l, m, o) : 0;
		e.moveTo(c + g, l + _), e.lineTo(u + g, f + _), e.stroke(), e.setLineDash([]);
	}
}
function Jr(e) {
	switch (e) {
		case "thick": return 3;
		case "medium":
		case "mediumDashed":
		case "mediumDashDot":
		case "mediumDashDotDot":
		case "slantDashDot": return 2;
		case "hair": return .5;
		default: return 1;
	}
}
function Yr(e) {
	return A(e);
}
function Xr(e) {
	switch (e) {
		case "double": return 13;
		case "thick": return 12;
		case "medium": return 11;
		case "mediumDashed": return 10;
		case "mediumDashDot": return 9;
		case "slantDashDot": return 8;
		case "mediumDashDotDot": return 7;
		case "thin": return 6;
		case "dashed": return 5;
		case "dashDot": return 4;
		case "dashDotDot": return 3;
		case "dotted": return 2;
		case "hair": return 1;
		default: return 0;
	}
}
function Zr(e, t) {
	let n = Xr(e?.style), r = Xr(t?.style);
	return n === 0 && r === 0 ? null : n >= r ? e ?? null : t ?? null;
}
function Qr(e, t, n, r, i, a, o, s, c, l, u, d, f) {
	if (l <= 0 || u <= 0) return;
	let p = Ar(t, i, n), m = jr(t, r, n), h = jn(s, l, f, d);
	for (let r of t.charts) {
		let i = r.fromCol + 1, g = r.fromRow + 1, _ = r.toCol + 1, v = r.toRow + 1, y = Ar(t, i, n) + r.fromColOff * n / W, b = jr(t, g, n) + r.fromRowOff * n / W, S = Ar(t, _, n) + r.toColOff * n / W, C = jr(t, v, n) + r.toRowOff * n / W, w = S - y, T = C - b;
		if (w <= 0 || T <= 0) continue;
		let E = jn(s + (y - p) - a, w, f, d), D = c + (b - m) - o;
		if (E + w < h || E > h + l || D + T < c || D > c + u) continue;
		e.save(), e.beginPath(), e.rect(h, c, l, u), e.clip();
		let O = x * n;
		_e(e, r.chart, {
			x: E,
			y: D,
			w,
			h: T
		}, O), e.restore();
	}
}
var $r = "600 12px \"Meiryo UI\", \"Segoe UI\", sans-serif", ei = "11px \"Meiryo UI\", \"Segoe UI\", sans-serif", ti = "#FFFFFF", ni = "#BFBFBF", ri = "#F2F2F2", ii = "#404040", ai = "#FFFFFF", oi = "#000000", si = "#A5A5A5", ci = "#E7E6E6", li = "#A6A6A6", ui = "#C6C6C6";
function di(e, t, n, r, i, a, o, s, c, l, u, d, f) {
	if (l <= 0 || u <= 0) return;
	let p = t.slicers;
	if (!p) return;
	let m = Ar(t, i, n), h = jr(t, r, n), g = jn(s, l, f, d);
	for (let r of p) {
		let i = r.fromCol + 1, p = r.fromRow + 1, _ = r.toCol + 1, v = r.toRow + 1, y = Ar(t, i, n) + r.fromColOff * n / W, b = jr(t, p, n) + r.fromRowOff * n / W, x = Ar(t, _, n) + r.toColOff * n / W, S = jr(t, v, n) + r.toRowOff * n / W, C = x - y, w = S - b;
		if (C <= 0 || w <= 0) continue;
		let T = jn(s + (y - m) - a, C, f, d), E = c + (b - h) - o;
		T + C < g || T > g + l || E + w < c || E > c + u || (e.save(), e.beginPath(), e.rect(g, c, l, u), e.clip(), fi(e, r.caption, r.items, T, E, C, w, n), e.restore());
	}
}
function fi(e, t, n, r, i, a, o, s) {
	e.fillStyle = ti, e.fillRect(r, i, a, o), e.strokeStyle = ni, e.lineWidth = 1, e.strokeRect(r + .5, i + .5, a - 1, o - 1);
	let c = Math.max(20 * s, 14);
	e.fillStyle = ri, e.fillRect(r + 1, i + 1, a - 2, c), e.fillStyle = ii, e.font = pi($r, s), e.textBaseline = "middle", e.textAlign = "left";
	let l = 6 * s;
	if (mi(e, t, r + l, i + c / 2 + 1, a - 2 * l), n.length === 0) return;
	let u = Math.max(1, Math.round(2 * s)), d = 4 * s, f = r + d, p = i + c + d, m = a - 2 * d, h = o - c - 2 * d;
	if (m <= 0 || h <= 0) return;
	let g = Math.max(18 * s, 16), _ = Math.max(1, Math.floor((h + u) / (g + u))), v = Math.min(n.length, _), y = Math.min(g, (h - u * (v - 1)) / v);
	if (y <= 0) return;
	e.font = pi(ei, s);
	let b = 8 * s;
	for (let t = 0; t < v; t++) {
		let r = n[t], i = p + t * (y + u), a = r.selected;
		e.fillStyle = a ? ai : ci, e.fillRect(f, i, m, y), e.strokeStyle = a ? si : ui, e.lineWidth = 1, e.strokeRect(f + .5, i + .5, m - 1, y - 1), e.fillStyle = a ? oi : li, mi(e, r.name, f + b, i + y / 2 + 1, m - 2 * b);
	}
}
function pi(e, t) {
	return e.replace(/(\d+(?:\.\d+)?)px/, (e, n) => `${Math.round(Number(n) * t)}px`);
}
function mi(e, t, n, r, i) {
	if (i <= 0) return;
	let a = t;
	if (e.measureText(a).width > i) {
		for (; a.length > 0 && e.measureText(a + "…").width > i;) a = a.slice(0, -1);
		a = a.length > 0 ? a + "…" : "";
	}
	e.fillText(a, n, r);
}
//#endregion
//#region packages/xlsx/src/render-orchestrator.ts
async function hi(e, t, n, r, i = 0, a = 0, o = null, s = null, c) {
	let l = t === "image/svg+xml", u = ue(t, o, i, a), d = () => xe(e, t, s, r, {
		widthPt: u.widthPt,
		heightPt: u.heightPt,
		offscreenFactory: c
	}), f = {
		svgImagePath: n,
		srcRect: o
	};
	if (P(f)) try {
		return await q(f.svgImagePath, r);
	} catch {
		return l ? q(e, r) : d();
	}
	return l ? q(e, r) : d();
}
async function gi(e, n, r, i) {
	if (!r) return;
	let a = r, o = /* @__PURE__ */ new Map();
	if (e.images) for (let n of e.images) o.set(bn(n.imagePath, n.duotone), {
		imagePath: n.imagePath,
		mimeType: n.mimeType,
		svgImagePath: n.svgImagePath,
		widthPt: n.nativeExtCx > 0 ? n.nativeExtCx / t : 0,
		heightPt: n.nativeExtCy > 0 ? n.nativeExtCy / t : 0,
		srcRect: n.srcRect ?? null,
		duotone: n.duotone ?? null
	});
	if (e.shapeGroups) for (let n of e.shapeGroups) for (let e of n.shapes) e.geom.type === "image" && o.set(bn(e.geom.imagePath, e.geom.duotone), {
		imagePath: e.geom.imagePath,
		mimeType: e.geom.mimeType,
		svgImagePath: e.geom.svgImagePath,
		widthPt: n.nativeExtCx > 0 ? n.nativeExtCx * e.w / t : 0,
		heightPt: n.nativeExtCy > 0 ? n.nativeExtCy * e.h / t : 0,
		srcRect: e.geom.srcRect ?? null,
		duotone: e.geom.duotone ?? null
	});
	o.size !== 0 && await Promise.all([...o.entries()].map(async ([e, t]) => {
		try {
			let r = await hi(t.imagePath, t.mimeType, t.svgImagePath, a, t.widthPt, t.heightPt, t.srcRect, t.duotone, i?.offscreenFactory);
			n.set(e, r);
		} catch {
			n.delete(e);
		}
	}));
}
async function _i(e, t, n, r = {}) {
	let i = r.fetchImage ? me(r.fetchImage) : void 0;
	try {
		await vi(e, t, n, r);
	} finally {
		i?.();
	}
}
async function vi(e, t, n, r = {}) {
	let { ws: i, styles: a, imageCache: o } = e;
	await gi(i, o, r.fetchImage), e.math && Vr(i) && await Hr(i, e.math);
	let s = r.dpr ?? _(), c = fe(t) ? t.clientWidth || 800 : t.width, l = fe(t) ? t.clientHeight || 600 : t.height, u = r.width ?? c, d = r.height ?? l, f = N(u * s, d * s), p = f.clamped ? s * f.scale : s, m = f.width, h = f.height;
	if (t.width !== m && (t.width = m), t.height !== h && (t.height = h), fe(t)) {
		let e = `${u}px`, n = `${d}px`;
		t.style.width !== e && (t.style.width = e), t.style.height !== n && (t.style.height = n);
	}
	let g = t.getContext("2d");
	if (g.setTransform(p, 0, 0, p, 0, 0), i.parseError) {
		yi(g, u, d, i.name, i.parseError);
		return;
	}
	Or(g, i, a, n, {
		...r,
		dpr: p,
		loadedImages: o
	});
}
function yi(e, t, n, r, i) {
	e.save(), e.fillStyle = "#f7f7f8", e.fillRect(0, 0, t, n);
	let a = t / 2, o = Math.min(t, n), s = Math.max(20, o * .1);
	e.fillStyle = "#b23b3b", e.textAlign = "center", e.textBaseline = "middle", e.font = `${s}px sans-serif`, e.fillText("⚠", a, n * .32);
	let c = Math.max(13, o * .035);
	e.fillStyle = "#333333", e.font = `600 ${c}px sans-serif`, e.fillText(`Sheet "${r}" could not be displayed`, a, n * .46);
	let l = Math.max(10, o * .022);
	e.fillStyle = "#666666", e.font = `${l}px sans-serif`;
	let u = Math.min(t * .8, 640), d = i.split(/\s+/), f = [], p = "";
	for (let t of d) {
		let n = p ? `${p} ${t}` : t;
		if (e.measureText(n).width > u && p ? (f.push(p), p = t) : p = n, f.length >= 4) break;
	}
	p && f.length < 4 && f.push(p);
	let m = l * 1.4, h = n * .52 + m;
	for (let t of f.slice(0, 4)) e.fillText(t, a, h), h += m;
	e.restore();
}
//#endregion
//#region packages/xlsx/src/google-fonts.ts
var bi = {
	...r,
	...u
};
function* xi(e) {
	for (let t of e?.sharedStrings ?? []) if (t.runs && t.runs.length > 0) for (let e of t.runs) yield e.text;
	else yield t.text;
}
function Si(e) {
	let t = /* @__PURE__ */ new Set(), n = null;
	for (let r of e?.styles?.fonts ?? []) r.name && (t.add(r.name), n ??= y(r.name));
	for (let r of be(xi(e), n)) t.add(r);
	return t;
}
//#endregion
//#region packages/xlsx/src/shared-strings.ts
function Ci(e, t) {
	for (let n of e.rows) for (let e of n.cells) {
		let n = e.value;
		if (n.type === "shared") {
			let r = t[n.si];
			if (r) {
				let t = {
					type: "text",
					text: r.text
				};
				r.runs !== void 0 && (t.runs = r.runs), r.phoneticRuns !== void 0 && (t.phoneticRuns = r.phoneticRuns), r.phoneticPr !== void 0 && (t.phoneticPr = r.phoneticPr), e.value = t;
			} else e.value = {
				type: "text",
				text: ""
			};
		}
	}
	return e;
}
function wi(e) {
	let t = (e ?? "").trim();
	if (!t) return {
		kind: "unresolved",
		formula: ""
	};
	if (t.length >= 2 && t.startsWith("\"") && t.endsWith("\"")) return {
		kind: "inline",
		values: t.slice(1, -1).split(",").map((e) => e.trim()).filter((e) => e.length > 0)
	};
	let n, r = t, i = t.indexOf("!");
	if (i >= 0) {
		let e = t.slice(0, i);
		e.startsWith("'") && e.endsWith("'") && e.length >= 2 && (e = e.slice(1, -1).replace(/''/g, "'")), n = e, r = t.slice(i + 1);
	}
	let [a, o] = r.split(":"), s = _n(a ?? "");
	if (s) {
		let e = o ? _n(o) : s;
		if (e) {
			let t = {
				row: Math.min(s.row, e.row),
				col: Math.min(s.col, e.col)
			}, r = {
				row: Math.max(s.row, e.row),
				col: Math.max(s.col, e.col)
			};
			return {
				kind: "range",
				sheet: n,
				start: t,
				end: r
			};
		}
	}
	return {
		kind: "unresolved",
		formula: t
	};
}
function Ti(e, t) {
	if (e.kind === "inline") return {
		kind: "values",
		values: e.values
	};
	if (e.kind === "unresolved") return {
		kind: "formula",
		formula: e.formula
	};
	let n = [];
	for (let r = e.start.row; r <= e.end.row; r++) for (let i = e.start.col; i <= e.end.col; i++) {
		let e = t(r, i);
		e != null && e !== "" && n.push(e);
	}
	return {
		kind: "values",
		values: n
	};
}
function Ei(e) {
	let { cell: t, panel: n, viewport: r, rtl: i } = e, a = t.y + t.h + 2, o = t.y - 2 - n.h, s;
	s = a + n.h <= r.h ? a : o >= 0 ? o : a, s = Math.max(0, Math.min(s, r.h - n.h));
	let c = i ? t.x + t.w - n.w : t.x;
	return c = Math.max(0, Math.min(c, r.w - n.w)), {
		left: c,
		top: s
	};
}
//#endregion
//#region packages/xlsx/src/workbook.ts
var Di = class e {
	worker;
	bridge;
	parsedWorkbook = null;
	sheetCache = /* @__PURE__ */ new Map();
	imageCache = /* @__PURE__ */ new Map();
	imageBlobCache = /* @__PURE__ */ new Map();
	_fetchImage = (e, t) => this.getImage(e, t);
	rawData = null;
	maxZipEntryBytes;
	math;
	googleFontFaces = [];
	_mode = "main";
	constructor(e, t, n) {
		this.worker = e, this._mode = t, this.bridge = new j(this.worker, {
			correlate: (e) => e.id,
			toError: (e) => e.type === "error" ? e.message : void 0
		});
		let r = new URL(n ?? Fe, location.href).href;
		this.bridge.post({
			type: "init",
			wasmUrl: r
		});
	}
	static async load(t, n = {}) {
		let r = n.mode ?? "main";
		if (r === "worker" && (typeof Worker > "u" || typeof OffscreenCanvas > "u")) throw Error("mode: 'worker' requires Worker and OffscreenCanvas support");
		let i;
		if (typeof t == "string") {
			let e = await fetch(t);
			if (!e.ok) throw Error(`Failed to fetch: ${e.status} ${e.statusText}`);
			i = await e.arrayBuffer();
		} else i = t;
		i = g(await K(i, n.password));
		let a = new e(r === "worker" ? (await import("./render-worker-host-Custze53.js")).createRenderWorker() : new Pe(), r, n.wasmUrl);
		return await a._load(i, n), a;
	}
	async _load(e, t = {}) {
		this.rawData = e, this.maxZipEntryBytes = t.maxZipEntryBytes, this.math = t.math, t.math && this._mode === "worker" && console.warn("[ooxml] the math engine is unavailable in mode: 'worker'; equations will be skipped. Use mode: 'main' for workbooks with equations.");
		let n = await this.bridge.request((n) => this._mode === "worker" ? {
			type: "parse",
			id: n,
			data: e.slice(0),
			maxZipEntryBytes: this.maxZipEntryBytes,
			useGoogleFonts: !!t.useGoogleFonts
		} : {
			type: "parse",
			id: n,
			data: e.slice(0),
			maxZipEntryBytes: this.maxZipEntryBytes
		}, void 0, { timeoutMs: t.workerTimeoutMs });
		if (this._mode === "worker") this.parsedWorkbook = n.workbook;
		else {
			let { workbookJson: e } = n;
			this.parsedWorkbook = JSON.parse(new TextDecoder().decode(new Uint8Array(e)));
		}
		let r = this.parsedWorkbook?.workbook.parseError;
		r && console.warn(`[ooxml] xlsx opened with a degraded part: ${r}`), this._mode === "main" && t.useGoogleFonts && (this.googleFontFaces = await p(Si(this.parsedWorkbook), bi));
	}
	get sheetNames() {
		return this.parsedWorkbook?.workbook.sheets.map((e) => e.name) ?? [];
	}
	get sheetCount() {
		return this.parsedWorkbook?.workbook.sheets.length ?? 0;
	}
	get tabColors() {
		return this.parsedWorkbook?.workbook.sheets.map((e) => e.tabColor ?? null) ?? [];
	}
	sheetVisibility(e) {
		return Ie(this.parsedWorkbook?.workbook.sheets ?? [], e);
	}
	isHidden(e) {
		return this.sheetVisibility(e) !== "visible";
	}
	async getWorksheet(e) {
		let t = this.sheetCache.get(e);
		if (t) return t;
		if (!this.parsedWorkbook || !this.rawData) throw Error("Workbook not loaded");
		let n = this.parsedWorkbook.workbook.sheets[e];
		if (!n) throw Error(`Sheet index ${e} out of range`);
		let r = await this.bridge.request((t) => ({
			type: "parseSheet",
			id: t,
			sheetIndex: e,
			sheetName: n.name,
			maxZipEntryBytes: this.maxZipEntryBytes
		})), i;
		if (this._mode === "worker") i = r.worksheet;
		else {
			let { worksheetJson: e } = r;
			i = JSON.parse(new TextDecoder().decode(new Uint8Array(e)));
		}
		return Ci(i, this.parsedWorkbook.sharedStrings), this.sheetCache.set(e, i), i;
	}
	async getImage(e, t) {
		let n = this.imageBlobCache.get(e);
		if (n) return n;
		let r = this.bridge.request((t) => ({
			type: "extractImage",
			id: t,
			path: e
		})).then((e) => {
			let n = e.bytes;
			return new Blob([n], { type: t });
		});
		return this.imageBlobCache.set(e, r), r;
	}
	async toMarkdown() {
		return (await this.bridge.request((e) => ({
			type: "toMarkdown",
			id: e
		}))).markdown;
	}
	async resolveValidationList(e, t) {
		if (!this.parsedWorkbook) throw Error("Workbook not loaded");
		let n = wi(t);
		if (n.kind !== "range") return Ti(n, () => null);
		let r = e;
		if (n.sheet) {
			let e = this.sheetNames.findIndex((e) => e.toLowerCase() === n.sheet?.toLowerCase());
			if (e < 0) return {
				kind: "formula",
				formula: t ?? ""
			};
			r = e;
		}
		let i = await this.getWorksheet(r), a = this.parsedWorkbook.styles, o = /* @__PURE__ */ new Map();
		for (let e of i.rows) for (let t of e.cells) o.set(`${t.row}:${t.col}`, t);
		return Ti(n, (e, t) => {
			let n = o.get(`${e}:${t}`);
			return n ? bt(n, a, null, i.date1904) : null;
		});
	}
	cellText(e, t) {
		return this.parsedWorkbook ? bt(t, this.parsedWorkbook.styles, null, e.date1904) : "";
	}
	async renderViewport(e, t, n, r = {}) {
		if (this._mode === "worker") throw Error("renderViewport(canvas) is unavailable in mode: 'worker'; use renderViewportToBitmap() and paint it via an ImageBitmapRenderingContext");
		if (!this.parsedWorkbook) throw Error("Workbook not loaded");
		return _i({
			ws: this.sheetCache.get(t) ?? await this.getWorksheet(t),
			styles: this.parsedWorkbook.styles,
			imageCache: this.imageCache,
			math: this.math
		}, e, n, {
			...r,
			fetchImage: this._fetchImage
		});
	}
	async renderViewportToBitmap(e, t, n) {
		let r = {
			...n,
			dpr: n.dpr ?? _()
		};
		if (this._mode === "worker") {
			if (!Number.isInteger(e) || e < 0 || e >= this.sheetCount) throw Error(`Sheet index ${e} out of range (count: ${this.sheetCount})`);
			return (await this.bridge.request((n) => ({
				type: "renderViewport",
				id: n,
				sheetIndex: e,
				viewport: t,
				opts: r
			}))).bitmap;
		}
		let i = new OffscreenCanvas(1, 1);
		return await this.renderViewport(i, e, t, r), i.transferToImageBitmap();
	}
	destroy() {
		this.bridge.terminate(), this.parsedWorkbook = null, this.sheetCache.clear(), this.googleFontFaces.length > 0 && (te(this.googleFontFaces), this.googleFontFaces = []), this.imageCache.clear(), R(this._fetchImage), Se(this._fetchImage), oe(this._fetchImage), this.imageBlobCache.clear(), this.rawData = null;
	}
};
//#endregion
//#region packages/xlsx/src/data-validation.ts
function Oi(e, t, n) {
	if (!e) return !1;
	for (let r of e.split(/\s+/)) {
		if (!r) continue;
		let [e, i] = r.split(":"), a = _n(e);
		if (!a) continue;
		if (!i) {
			if (a.row === t && a.col === n) return !0;
			continue;
		}
		let o = _n(i);
		if (!o) continue;
		let s = Math.min(a.row, o.row), c = Math.max(a.row, o.row), l = Math.min(a.col, o.col), u = Math.max(a.col, o.col);
		if (t >= s && t <= c && n >= l && n <= u) return !0;
	}
	return !1;
}
function ki(e, t, n) {
	if (!e) return null;
	for (let r of e) if (r.validationType === "list" && Oi(r.sqref, t, n)) return r;
	return null;
}
//#endregion
//#region packages/xlsx/src/find.ts
var Ai = class {
	_matches = [];
	_active = -1;
	constructor(e, t, n) {
		this._sheetCount = e, this._sheetName = t, this._collectSheetCells = n;
	}
	invalidate() {
		this._matches = [], this._active = -1;
	}
	sheetHighlights(e) {
		let t = [];
		for (let n = 0; n < this._matches.length; n++) {
			let r = this._matches[n];
			r.sheet === e && t.push({
				row: r.row,
				col: r.col,
				active: n === this._active
			});
		}
		return t;
	}
	activeLocation() {
		return this._locationAt(this._active);
	}
	_locationAt(e) {
		let t = this._matches[e];
		return t ? {
			sheet: t.sheet,
			sheetName: t.sheetName,
			ref: vn(t.row, t.col),
			row: t.row,
			col: t.col
		} : null;
	}
	matches() {
		return this._matches.map((e, t) => {
			let n = this._locationAt(t);
			return {
				matchIndex: t,
				text: e.text,
				location: n
			};
		});
	}
	async find(e, t = {}) {
		if (this._matches = [], this._active = -1, e.length === 0) return [];
		let n = this._sheetCount();
		for (let r = 0; r < n; r++) {
			let n = await this._collectSheetCells(r), i = this._sheetName(r);
			for (let a of n) {
				let n = ne(pe([{ text: a.text }]), e, t);
				for (let e of n) {
					let t = e.slices[0], n = a.text.slice(t.start, t.end);
					this._matches.push({
						sheet: r,
						sheetName: i,
						row: a.row,
						col: a.col,
						text: n
					});
				}
			}
		}
		return this.matches();
	}
	next() {
		return this._active = he(this._active, this._matches.length), this._activePublic();
	}
	prev() {
		return this._active = le(this._active, this._matches.length), this._activePublic();
	}
	_activePublic() {
		let e = this._locationAt(this._active);
		return e ? {
			matchIndex: this._active,
			text: this._matches[this._active].text,
			location: e
		} : null;
	}
};
function ji(e) {
	let { cell: t, popup: n, viewport: r, rtl: i } = e, a = t.x + t.w + 8, o = t.x - 8 - n.w, s = a + n.w <= r.w, c = o >= 0, l;
	l = i ? c ? o : s ? a : o : s ? a : c ? o : a, l = Math.max(0, Math.min(l, r.w - n.w));
	let u = t.y;
	return u = Math.max(0, Math.min(u, r.h - n.h)), {
		left: l,
		top: u
	};
}
function Mi(e) {
	return e > 0 ? (e + 1) * 19 : 0;
}
function Ni(e, t) {
	let n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), i = 0, a = 0;
	for (let t of e) t.level > 0 && n.set(t.index, t.level), t.collapsed && r.set(t.index, !0), t.index > i && (i = t.index), t.level > a && (a = t.level);
	let o = i, s = [];
	if (a === 0) return {
		maxLevel: 0,
		groups: s
	};
	let c = (e) => n.get(e) ?? 0;
	for (let e = 1; e <= a; e++) {
		let n = null;
		for (let i = 1; i <= o + 1; i++) c(i) >= e ? n ? n.end = i : n = {
			start: i,
			end: i
		} : n &&= (s.push(Pi(e, n, t, r, c)), null);
		n && s.push(Pi(e, n, t, r, c));
	}
	return {
		maxLevel: a,
		groups: s
	};
}
function Pi(e, t, n, r, i) {
	let a = null;
	if (n) {
		let n = t.end + 1;
		n >= 1 && i(n) < e && (a = n);
	} else {
		let n = t.start - 1;
		n >= 1 && i(n) < e && (a = n);
	}
	let o = a != null && (r.get(a) ?? !1);
	return {
		level: e,
		start: t.start,
		end: t.end,
		summary: a,
		collapsed: o
	};
}
function Fi(e, t) {
	let n = !e.collapsed, r = /* @__PURE__ */ new Map();
	for (let e of t) r.set(e.index, e);
	let i = [], a = [];
	if (n) for (let t = e.start; t <= e.end; t++) i.push(t);
	else {
		let n = /* @__PURE__ */ new Set();
		for (let r of t) r.index >= e.start && r.index <= e.end && r.collapsed && n.add(r.index);
		for (let t = e.start; t <= e.end; t++) Ii(t, e, r, n) || a.push(t);
	}
	return {
		hide: i,
		show: a,
		nowCollapsed: n
	};
}
function Ii(e, t, n, r) {
	let i = n.get(e)?.level ?? 0;
	if (i <= t.level) return !1;
	for (let e of r) {
		let r = n.get(e)?.level ?? 0;
		if (!(r >= i) && !(r < t.level)) return !0;
	}
	return !1;
}
function Li(e, t) {
	let n = [], r = [];
	for (let i of e) i.level >= t ? n.push(i.index) : r.push(i.index);
	return {
		hide: n,
		show: r
	};
}
function Ri(e) {
	let t = [];
	for (let n of e.rows) {
		let e = n.outlineLevel ?? 0, r = n.collapsed ?? !1;
		e === 0 && !r || t.push({
			index: n.index,
			level: e,
			collapsed: r,
			hidden: n.hidden ?? !1
		});
	}
	return t;
}
function zi(e) {
	let t = e.colOutlineLevels ?? {}, n = e.colCollapsed ?? {}, r = e.colHidden ?? {}, i = /* @__PURE__ */ new Set();
	for (let e of Object.keys(t)) i.add(Number(e));
	for (let e of Object.keys(n)) i.add(Number(e));
	let a = [];
	for (let e of [...i].sort((e, t) => e - t)) a.push({
		index: e,
		level: t[e] ?? 0,
		collapsed: n[e] ?? !1,
		hidden: r[e] ?? !1
	});
	return a;
}
function Bi(e, t) {
	let n = e.outlinePr;
	return n ? t === "row" ? n.summaryBelow : n.summaryRight : !0;
}
//#endregion
//#region packages/xlsx/src/viewer.ts
var Vi = 150, Hi = 280, Ui = 200, Wi = 240, Gi = 200, Ki = 30, qi = 1, Ji = .45, Yi = "data-xlsx-viewer-styles", Xi = ".xlsx-tab-strip::-webkit-scrollbar{display:none}.xlsx-tab-nav{background:transparent;transition:background 0.1s;}.xlsx-tab-nav:hover{background:rgba(0,0,0,0.08);}.xlsx-zoom-slider{-webkit-appearance:none;appearance:none;background:transparent;height:15px;margin:0;}.xlsx-zoom-slider::-webkit-slider-runnable-track{height:4px;background:#c4c4c4;border-radius:2px;}.xlsx-zoom-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;margin-top:-4px;border-radius:50%;background:#808080;cursor:pointer;}.xlsx-zoom-slider:hover::-webkit-slider-thumb{background:#5f5f5f;}.xlsx-zoom-slider::-moz-range-track{height:4px;background:#c4c4c4;border-radius:2px;}.xlsx-zoom-slider::-moz-range-thumb{width:12px;height:12px;border:none;border-radius:50%;background:#808080;cursor:pointer;}";
function Zi() {
	if (typeof document > "u" || !document.head || document.head.querySelector(`style[${Yi}]`)) return;
	let e = document.createElement("style");
	e.setAttribute(Yi, ""), e.textContent = Xi, document.head.appendChild(e);
}
var Qi = class {
	idxs;
	cumDelta;
	constructor(e, t, n, r) {
		this.defaultPx = t, this.maxIndex = r, this.idxs = Object.keys(e).map(Number).filter((e) => e >= 1 && e <= r).sort((e, t) => e - t), this.cumDelta = Array(this.idxs.length);
		let i = 0;
		for (let r = 0; r < this.idxs.length; r++) i += n(e[this.idxs[r]]) - t, this.cumDelta[r] = i;
	}
	deltaBefore(e) {
		let t = 0, n = this.idxs.length;
		for (; t < n;) {
			let r = t + n >> 1;
			this.idxs[r] < e ? t = r + 1 : n = r;
		}
		return t === 0 ? 0 : this.cumDelta[t - 1];
	}
	offsetOf(e) {
		return (e - 1) * this.defaultPx + this.deltaBefore(e);
	}
	indexAt(e) {
		if (e <= 0) return {
			index: 1,
			partial: 0
		};
		let t = 1, n = this.maxIndex;
		for (; t < n;) {
			let r = t + n + 1 >> 1;
			this.offsetOf(r) <= e ? t = r : n = r - 1;
		}
		return {
			index: t,
			partial: e - this.offsetOf(t)
		};
	}
	scrollableIndexAt(e, t) {
		let n = e + this.offsetOf(t);
		return n >= this.offsetOf(this.maxIndex) + this.sizeOf(this.maxIndex) ? null : this.indexAt(n).index;
	}
	sizeOf(e) {
		return this.offsetOf(e + 1) - this.offsetOf(e);
	}
}, $i = "#1a73e8", ea = 4, ta = 5;
function na(e, t, n, r) {
	for (let { index: i, edge: a } of t) if (!(a <= r) && Math.abs(e - a) <= n) return i;
	return null;
}
function ra(e) {
	return {
		border: `2px solid ${e}`,
		background: `color-mix(in srgb, ${e} 8%, transparent)`
	};
}
var ia = /* @__PURE__ */ new WeakMap();
function aa(e, t) {
	let n = ia.get(e);
	if (n) return n;
	let r = {
		col: new Qi(e.colWidths, Q(e.defaultColWidth, t), (e) => Q(e, t), 16384),
		row: new Qi(e.rowHeights, $(e.defaultRowHeight), (e) => $(e), 1048576)
	};
	return ia.set(e, r), r;
}
var oa = class {
	wb = null;
	wrapper;
	canvas;
	gridRegion;
	rowGutter;
	colGutter;
	cornerGutter;
	gutter = {
		w: 0,
		h: 0
	};
	rowOutline = null;
	colOutline = null;
	rowOutlineBands = [];
	colOutlineBands = [];
	stashedRowHeights = /* @__PURE__ */ new Map();
	stashedColWidths = /* @__PURE__ */ new Map();
	sizeOverrideStore = /* @__PURE__ */ new Map();
	canvasArea;
	scrollHost;
	spacer;
	tabBar;
	tabStrip;
	navPrev;
	navNext;
	navGroup;
	tabs = [];
	tabColors = [];
	zoomSlider = null;
	zoomLabel = null;
	currentSheet = 0;
	_hiddenSheetMode;
	currentWorksheet = null;
	opts;
	_mode;
	_bitmapCtx = null;
	_destroyed = !1;
	_loadGen = 0;
	resizeObserver = null;
	_rafId = null;
	_renderSeq = 0;
	effectiveH = 0;
	_pendingZoomAnchor = null;
	anchorCell = null;
	activeCell = null;
	selectionMode = "cells";
	isSelecting = !1;
	selectionOverlay;
	findOverlay;
	_find;
	keydownHandler = null;
	pendingTap = null;
	pendingClick = null;
	resizeDrag = null;
	commentPopup;
	commentMap = /* @__PURE__ */ new Map();
	hyperlinkMap = /* @__PURE__ */ new Map();
	commentPopupKey = null;
	commentPopupTimer = null;
	validationPanel;
	validationPanelKey = null;
	validationArrowRect = null;
	validationOutsideHandler = null;
	constructor(e, t = {}) {
		this.opts = t, this._mode = t.mode ?? "main", this._hiddenSheetMode = t.hiddenSheetMode ?? "show", this.wrapper = document.createElement("div"), this.wrapper.style.cssText = "position:relative;width:100%;height:100%;border:1px solid #c8ccd0;background:#fff;box-sizing:border-box;font-family:sans-serif;display:flex;flex-direction:column;", this.gridRegion = document.createElement("div"), this.gridRegion.style.cssText = "position:relative;flex:1;min-height:0;overflow:hidden;";
		let n = "position:absolute;top:0;left:0;z-index:3;display:none;background:#f5f5f5;";
		this.cornerGutter = document.createElement("canvas"), this.cornerGutter.style.cssText = n, this.cornerGutter.setAttribute("data-xlsx-outline", "corner"), this.colGutter = document.createElement("canvas"), this.colGutter.style.cssText = n, this.colGutter.setAttribute("data-xlsx-outline", "col"), this.rowGutter = document.createElement("canvas"), this.rowGutter.style.cssText = n, this.rowGutter.setAttribute("data-xlsx-outline", "row"), this.canvasArea = document.createElement("div"), this.canvasArea.style.cssText = "position:absolute;inset:0;overflow:hidden;", this.canvas = document.createElement("canvas"), this.canvas.style.cssText = "position:absolute;top:0;left:0;z-index:0;display:block;", this._mode === "worker" && (this._bitmapCtx = this.canvas.getContext("bitmaprenderer")), this.selectionOverlay = document.createElement("div"), this.selectionOverlay.style.cssText = "position:absolute;top:0;left:0;z-index:1;pointer-events:none;overflow:hidden;width:100%;height:100%;", this.findOverlay = document.createElement("div"), this.findOverlay.style.cssText = "position:absolute;top:0;left:0;z-index:1;pointer-events:none;overflow:hidden;width:100%;height:100%;", this.scrollHost = document.createElement("div"), this.scrollHost.style.cssText = "position:absolute;inset:0;overflow:auto;z-index:2;background:transparent;", this.spacer = document.createElement("div"), this.spacer.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;", this.scrollHost.appendChild(this.spacer), this.commentPopup = document.createElement("div"), this.commentPopup.style.cssText = `position:absolute;z-index:3;pointer-events:none;display:none;max-width:${Hi}px;max-height:${Ui}px;overflow:hidden;box-sizing:border-box;padding:6px 8px;background:#fffbcc;border:1px solid #b8b8a0;box-shadow:1px 2px 5px rgba(0,0,0,0.25);font:12px/1.4 sans-serif;color:#222;white-space:pre-wrap;word-break:break-word;`, this.validationPanel = document.createElement("div"), this.validationPanel.setAttribute("data-xlsx-validation-panel", ""), this.validationPanel.style.cssText = `position:absolute;z-index:4;pointer-events:auto;display:none;min-width:80px;max-width:${Wi}px;max-height:${Gi}px;overflow-y:auto;box-sizing:border-box;background:#fff;border:1px solid #7f7f7f;box-shadow:1px 2px 5px rgba(0,0,0,0.25);font:12px/1.4 sans-serif;color:#222;`, this.validationPanel.addEventListener("wheel", (e) => e.stopPropagation()), this.canvasArea.appendChild(this.canvas), this.canvasArea.appendChild(this.selectionOverlay), this.canvasArea.appendChild(this.findOverlay), this.canvasArea.appendChild(this.scrollHost), this.canvasArea.appendChild(this.commentPopup), this.canvasArea.appendChild(this.validationPanel);
		let r = Math.round(50 * (this.opts.cellScale ?? 1));
		this.tabBar = document.createElement("div"), this.tabBar.style.cssText = `display:flex;align-items:flex-end;height:${Ki}px;flex-shrink:0;background:#f0f0f0;border-top:1px solid #c8ccd0;`, this.navPrev = this.makeNavButton("◀", "Scroll tabs left", () => this.scrollTabs(-1)), this.navNext = this.makeNavButton("▶", "Scroll tabs right", () => this.scrollTabs(1)), this.navPrev.dataset.xlsxTabNav = "prev", this.navNext.dataset.xlsxTabNav = "next";
		let i = document.createElement("div");
		i.style.cssText = `display:flex;flex-shrink:0;width:${r}px;height:100%;`, i.appendChild(this.navPrev), i.appendChild(this.navNext), this.navGroup = i, this.tabStrip = document.createElement("div"), this.tabStrip.style.cssText = `position:relative;display:flex;align-items:flex-end;flex:1;min-width:0;height:100%;margin-left:${qi}px;overflow-x:auto;overflow-y:hidden;gap:${qi}px;scrollbar-width:none;`, this.tabStrip.classList.add("xlsx-tab-strip"), Zi(), this.tabStrip.addEventListener("scroll", () => this.updateNavButtons()), this.tabBar.appendChild(i), this.tabBar.appendChild(this.tabStrip), this.opts.showZoomSlider !== !1 && this.tabBar.appendChild(this.buildZoomControl()), this.gridRegion.appendChild(this.canvasArea), this.wrapper.appendChild(this.gridRegion), this.wrapper.appendChild(this.tabBar), e.appendChild(this.wrapper), this.rowGutter.addEventListener("pointerdown", (e) => this.onGutterPointerDown(e, "row")), this.colGutter.addEventListener("pointerdown", (e) => this.onGutterPointerDown(e, "col")), this.scrollHost.addEventListener("scroll", () => {
			this.pendingTap = null, this.hideCommentPopup(), this.hideValidationPanel(), this.scrollHost.clientWidth > 0 && (this.effectiveH = this.effectiveScrollLeft), this.scheduleRender(), this.updateSelectionOverlay(), this.updateFindOverlay();
		}), this.resizeObserver = new ResizeObserver(() => {
			this.reanchorHorizontalScroll(), this.layoutGutters(), this.scheduleRender(), this.updateSelectionOverlay(), this.updateFindOverlay(), this.updateNavButtons();
		}), this.resizeObserver.observe(this.gridRegion), this.setupSelectionEvents(), this._find = new Ai(() => this.sheetCount, (e) => this.wb?.sheetNames[e] ?? "", (e) => this._collectSheetCells(e));
	}
	async _collectSheetCells(e) {
		let t = this.wb;
		if (!t) return [];
		let n = await t.getWorksheet(e), r = [];
		for (let e of n.rows) for (let i of e.cells) {
			let e = t.cellText(n, i);
			e !== "" && r.push({
				row: i.row,
				col: i.col,
				text: e
			});
		}
		return r;
	}
	async load(e) {
		let t = ++this._loadGen, n = this.wb;
		try {
			let r = await Di.load(e, {
				useGoogleFonts: this.opts.useGoogleFonts,
				maxZipEntryBytes: this.opts.maxZipEntryBytes,
				workerTimeoutMs: this.opts.workerTimeoutMs,
				wasmUrl: this.opts.wasmUrl,
				math: this.opts.math,
				mode: this._mode
			});
			if (t !== this._loadGen) {
				r.destroy();
				return;
			}
			this.wb = r, n?.destroy(), this._find.invalidate(), this.sizeOverrideStore.clear(), this.buildTabs(), this.opts.onReady?.(this.wb.sheetNames), await this.showSheet(this._initialSheet());
		} catch (e) {
			if (t !== this._loadGen) return;
			let n = e instanceof Error ? e : Error(String(e));
			if (this.opts.onError) {
				this.opts.onError(n);
				return;
			}
			throw n;
		}
	}
	get workbook() {
		if (!this.wb) throw Error("Workbook not loaded");
		return this.wb;
	}
	async showSheet(e) {
		this.currentSheet = e, this.scrollHost.scrollTop = 0, this.anchorCell = null, this.activeCell = null, this.selectionMode = "cells", this.hideCommentPopup(), this.hideValidationPanel(), this.updateSelectionOverlay(), this.updateTabActive(e), this.currentWorksheet = await this.workbook.getWorksheet(e), this.buildCommentMap(this.currentWorksheet), this.buildHyperlinkMap(this.currentWorksheet), this.buildOutline(this.currentWorksheet), this.layoutGutters(), this.updateSpacerSize(this.currentWorksheet), this.resetHorizontalScroll(), await this.renderCurrentSheet(), this.updateFindOverlay(), this.opts.onSheetChange?.(e, this.workbook.sheetNames.length);
	}
	buildOutline(e) {
		this.stashedRowHeights.clear(), this.stashedColWidths.clear(), this.rowOutlineBands = Ri(e), this.colOutlineBands = zi(e);
		let t = Ni(this.rowOutlineBands, Bi(e, "row")), n = Ni(this.colOutlineBands, Bi(e, "col"));
		this.rowOutline = t.maxLevel > 0 ? t : null, this.colOutline = n.maxLevel > 0 ? n : null;
	}
	layoutGutters() {
		let e = this.opts.cellScale ?? 1, t = this.rowOutline ? Math.round(Mi(this.rowOutline.maxLevel) * e) : 0, n = this.colOutline ? Math.round(Mi(this.colOutline.maxLevel) * e) : 0;
		this.gutter = {
			w: t,
			h: n
		}, t > 0 || n > 0 ? this.colGutter.parentElement || (this.gridRegion.appendChild(this.colGutter), this.gridRegion.appendChild(this.rowGutter), this.gridRegion.appendChild(this.cornerGutter)) : (this.colGutter.remove(), this.rowGutter.remove(), this.cornerGutter.remove()), this.canvasArea.style.left = `${t}px`, this.canvasArea.style.top = `${n}px`;
		let r = (e, t, n, r, i) => {
			if (r <= 0 || i <= 0) {
				e.style.display = "none";
				return;
			}
			e.style.display = "block", e.style.left = `${t}px`, e.style.top = `${n}px`, e.style.width = `${r}px`, e.style.height = `${i}px`;
		}, i = this.gridRegion.clientWidth, a = this.gridRegion.clientHeight;
		r(this.cornerGutter, 0, 0, t, n), r(this.colGutter, t, 0, Math.max(0, i - t), n), r(this.rowGutter, 0, n, t, Math.max(0, a - n));
	}
	renderGutters() {
		this.currentWorksheet && (this.gutter.h > 0 && this.colOutline && this.paintAxisGutter("col"), this.gutter.w > 0 && this.rowOutline && this.paintAxisGutter("row"), (this.gutter.w > 0 || this.gutter.h > 0) && this.paintCornerGutter());
	}
	paintAxisGutter(e) {
		if (!this.currentWorksheet) return;
		let t = this.opts.cellScale ?? 1, n = window.devicePixelRatio ?? 1, r = e === "row", i = r ? this.rowGutter : this.colGutter, a = r ? this.rowOutline : this.colOutline;
		if (!a) return;
		let o = parseFloat(i.style.width) || 0, s = parseFloat(i.style.height) || 0;
		if (o <= 0 || s <= 0) return;
		i.width = Math.round(o * n), i.height = Math.round(s * n);
		let c = i.getContext("2d");
		if (!c) return;
		c.setTransform(n, 0, 0, n, 0, 0), c.clearRect(0, 0, o, s), c.fillStyle = "#f5f5f5", c.fillRect(0, 0, o, s);
		let l = 19 * t;
		c.strokeStyle = "#808080", c.lineWidth = 1, c.fillStyle = "#404040";
		for (let e of a.groups) {
			let n = (e.level - 1 + .5) * l, i = r ? this.getCellRect(e.start, 1) : this.getCellRect(1, e.start), a = r ? this.getCellRect(e.end, 1) : this.getCellRect(1, e.end);
			if (!i || !a) continue;
			let o = r ? i.y : this.screenX(i.x, i.w), s = r ? a.y + a.h : this.screenX(a.x, a.w) + a.w, u = Math.min(o, s), d = Math.max(o, s);
			if (!e.collapsed && d - u > 1) {
				if (c.beginPath(), r) {
					c.moveTo(n, u), c.lineTo(n, d);
					let t = e.summary != null && e.summary > e.end ? d : u;
					c.lineTo(n + l / 2, t);
				} else {
					c.moveTo(u, n), c.lineTo(d, n);
					let t = e.summary != null && e.summary > e.end ? d : u;
					c.lineTo(t, n + l / 2);
				}
				c.stroke();
			}
			if (e.summary != null) {
				let i = r ? this.getCellRect(e.summary, 1) : this.getCellRect(1, e.summary);
				if (i) {
					let a = r ? i.y + i.h / 2 : this.screenX(i.x, i.w) + i.w / 2;
					this.drawToggleBox(c, r ? n : a, r ? a : n, e.collapsed, t);
				}
			}
		}
		let u = r ? 22 * t / 2 : 50 * t / 2;
		for (let e = 1; e <= a.maxLevel + 1; e++) {
			let n = (e - .5) * l;
			if (n + l / 2 > (r ? o : s) + .5) break;
			this.drawLevelButton(c, r ? n : u, r ? u : n, String(e), t);
		}
	}
	drawToggleBox(e, t, n, r, i) {
		let a = Math.round(9 * i), o = Math.round(t - a / 2), s = Math.round(n - a / 2);
		e.save(), e.fillStyle = "#ffffff", e.strokeStyle = "#808080", e.lineWidth = 1, e.fillRect(o + .5, s + .5, a, a), e.strokeRect(o + .5, s + .5, a, a), e.strokeStyle = "#404040", e.beginPath(), e.moveTo(o + 2.5, s + a / 2 + .5), e.lineTo(o + a - 1.5, s + a / 2 + .5), r && (e.moveTo(o + a / 2 + .5, s + 2.5), e.lineTo(o + a / 2 + .5, s + a - 1.5)), e.stroke(), e.restore();
	}
	drawLevelButton(e, t, n, r, i) {
		let a = Math.round(11 * i), o = Math.round(t - a / 2), s = Math.round(n - a / 2);
		e.save(), e.font = `${Math.round(9 * i)}px sans-serif`, e.textAlign = "center", e.textBaseline = "middle", e.fillStyle = "#ffffff", e.strokeStyle = "#808080", e.lineWidth = 1, e.fillRect(o + .5, s + .5, a, a), e.strokeRect(o + .5, s + .5, a, a), e.fillStyle = "#404040", e.fillText(r, t, n + .5), e.restore();
	}
	paintCornerGutter() {
		let e = window.devicePixelRatio ?? 1, t = this.cornerGutter, n = parseFloat(t.style.width) || 0, r = parseFloat(t.style.height) || 0;
		if (n <= 0 || r <= 0) return;
		t.width = Math.round(n * e), t.height = Math.round(r * e);
		let i = t.getContext("2d");
		i && (i.setTransform(e, 0, 0, e, 0, 0), i.clearRect(0, 0, n, r), i.fillStyle = "#f5f5f5", i.fillRect(0, 0, n, r));
	}
	onGutterPointerDown(e, t) {
		if (!this.currentWorksheet) return;
		let n = t === "row", r = n ? this.rowOutline : this.colOutline;
		if (!r) return;
		let i = (n ? this.rowGutter : this.colGutter).getBoundingClientRect(), a = e.clientX - i.left, o = e.clientY - i.top, s = this.opts.cellScale ?? 1, c = 19 * s, l = 7 * s, u = n ? 22 * s / 2 : 50 * s / 2;
		if ((n ? o : a) <= (n ? 22 : 50) * s) {
			for (let i = 1; i <= r.maxLevel + 1; i++) {
				let r = (i - .5) * c, s = n ? r : u, d = n ? u : r;
				if (Math.abs(a - s) <= l && Math.abs(o - d) <= l) {
					e.preventDefault(), this.applyLevelButton(i, t);
					return;
				}
			}
			return;
		}
		for (let i of r.groups) {
			if (i.summary == null) continue;
			let r = (i.level - 1 + .5) * c, s = n ? this.getCellRect(i.summary, 1) : this.getCellRect(1, i.summary);
			if (!s) continue;
			let u = n ? s.y + s.h / 2 : this.screenX(s.x, s.w) + s.w / 2, d = n ? r : u, f = n ? u : r;
			if (Math.abs(a - d) <= l && Math.abs(o - f) <= l) {
				e.preventDefault(), this.applyGroupToggle(i, t);
				return;
			}
		}
	}
	applyGroupToggle(e, t) {
		let n = this.currentWorksheet;
		if (!n) return;
		let { hide: r, show: i, nowCollapsed: a } = Fi(e, t === "row" ? this.rowOutlineBands : this.colOutlineBands);
		for (let e of r) this.setBandHidden(t, e, !0);
		for (let e of i) this.setBandHidden(t, e, !1);
		e.summary != null && this.setBandCollapsed(t, e.summary, a), this.afterOutlineMutation(n);
	}
	applyLevelButton(e, t) {
		let n = this.currentWorksheet;
		if (!n) return;
		let { hide: r, show: i } = Li(t === "row" ? this.rowOutlineBands : this.colOutlineBands, e);
		for (let e of r) this.setBandHidden(t, e, !0);
		for (let e of i) this.setBandHidden(t, e, !1);
		let a = t === "row" ? this.rowOutline : this.colOutline;
		if (a) for (let n of a.groups) n.summary != null && this.setBandCollapsed(t, n.summary, n.level >= e);
		this.afterOutlineMutation(n);
	}
	setBandHidden(e, t, n) {
		let r = this.currentWorksheet;
		if (r) {
			if (e === "row") if (n) this.stashedRowHeights.has(t) || this.stashedRowHeights.set(t, r.rowHeights[t]), r.rowHeights[t] = 0;
			else if (this.stashedRowHeights.has(t)) {
				let e = this.stashedRowHeights.get(t);
				e === void 0 ? delete r.rowHeights[t] : r.rowHeights[t] = e, this.stashedRowHeights.delete(t);
			} else r.rowHeights[t] === 0 && delete r.rowHeights[t];
			else if (n) this.stashedColWidths.has(t) || this.stashedColWidths.set(t, r.colWidths[t]), r.colWidths[t] = 0;
			else if (this.stashedColWidths.has(t)) {
				let e = this.stashedColWidths.get(t);
				e === void 0 ? delete r.colWidths[t] : r.colWidths[t] = e, this.stashedColWidths.delete(t);
			} else r.colWidths[t] === 0 && delete r.colWidths[t];
			this.recordSizeOverride(e, t);
		}
	}
	recordSizeOverride(e, t) {
		let n = this.currentWorksheet;
		if (!n) return;
		let r = this.sizeOverrideStore.get(this.currentSheet);
		r || (r = {
			rows: /* @__PURE__ */ new Map(),
			cols: /* @__PURE__ */ new Map()
		}, this.sizeOverrideStore.set(this.currentSheet, r)), e === "row" ? r.rows.set(t, n.rowHeights[t] ?? null) : r.cols.set(t, n.colWidths[t] ?? null);
	}
	wireSizeOverrides() {
		let e = this.sizeOverrideStore.get(this.currentSheet);
		if (!e || e.rows.size === 0 && e.cols.size === 0) return;
		let t = {};
		return e.rows.size > 0 && (t.rows = Object.fromEntries(e.rows)), e.cols.size > 0 && (t.cols = Object.fromEntries(e.cols)), t;
	}
	setBandCollapsed(e, t, n) {
		let r = this.currentWorksheet;
		if (r) if (e === "row") {
			let e = r.rows.find((e) => e.index === t);
			e && (e.collapsed = n);
		} else r.colCollapsed = r.colCollapsed ?? {}, n ? r.colCollapsed[t] = !0 : delete r.colCollapsed[t];
	}
	afterOutlineMutation(e) {
		ia.delete(e), this.buildOutlineLayoutOnly(e), this.updateSpacerSize(e), this.updateSelectionOverlay(), this.scheduleRender();
	}
	buildOutlineLayoutOnly(e) {
		this.rowOutlineBands = Ri(e), this.colOutlineBands = zi(e);
		let t = Ni(this.rowOutlineBands, Bi(e, "row")), n = Ni(this.colOutlineBands, Bi(e, "col"));
		this.rowOutline = t.maxLevel > 0 ? t : null, this.colOutline = n.maxLevel > 0 ? n : null;
	}
	get isRtl() {
		return this.currentWorksheet?.rightToLeft === !0;
	}
	get maxScrollLeft() {
		return Math.max(0, this.scrollHost.scrollWidth - this.scrollHost.clientWidth);
	}
	get effectiveScrollLeft() {
		let e = this.scrollHost.scrollLeft;
		return this.isRtl ? this.maxScrollLeft - e : e;
	}
	screenX(e, t) {
		return this.isRtl ? An(e, t, this.canvasArea.clientWidth) : e;
	}
	resetHorizontalScroll() {
		this.effectiveH = 0, this.scrollHost.scrollLeft = this.isRtl ? this.maxScrollLeft : 0;
	}
	reanchorHorizontalScroll() {
		if (!this.isRtl || this.scrollHost.clientWidth === 0) return;
		let e = Math.max(0, this.maxScrollLeft - this.effectiveH);
		Math.abs(this.scrollHost.scrollLeft - e) > 1 && (this.scrollHost.scrollLeft = e);
	}
	get sheetIndex() {
		return this.currentSheet;
	}
	get sheetCount() {
		return this.wb?.sheetCount ?? 0;
	}
	async goToSheet(e) {
		this.sheetCount !== 0 && await this.showSheet(Math.max(0, Math.min(e, this.sheetCount - 1)));
	}
	async nextSheet() {
		await this.goToSheet(this._stepSheet(1));
	}
	async prevSheet() {
		await this.goToSheet(this._stepSheet(-1));
	}
	_stepSheet(e) {
		return this._hiddenSheetMode === "skip" && this.wb ? Ce(this.currentSheet, e, (e) => this.wb.isHidden(e), this.sheetCount) : this.currentSheet + e;
	}
	_initialSheet() {
		return this._hiddenSheetMode === "skip" && this.wb ? we(0, (e) => this.wb.isHidden(e), this.sheetCount) : 0;
	}
	getCellAt(e, t) {
		let n = this.currentWorksheet;
		if (!n) return null;
		let r = this.opts.cellScale ?? 1, i = this.canvasArea.getBoundingClientRect(), a = this.screenX(e - i.left, 0) / r, o = (t - i.top) / r;
		if (a < 50 || o < 22) return null;
		let s = a - 50, c = o - 22, l = n.freezeRows ?? 0, u = n.freezeCols ?? 0, d = 0, f = [];
		for (let e = 1; e <= l; e++) {
			let t = $(n.rowHeights[e] ?? n.defaultRowHeight);
			f.push(t), d += t;
		}
		let p = 0, m = [];
		for (let e = 1; e <= u; e++) {
			let t = Q(n.colWidths[e] ?? n.defaultColWidth, Z(n));
			m.push(t), p += t;
		}
		let h;
		if (c < d) {
			h = -1;
			let e = 0;
			for (let t = 0; t < l; t++) if (e += f[t], c < e) {
				h = t + 1;
				break;
			}
			if (h === -1) return null;
		} else {
			let e = c - d + this.scrollHost.scrollTop / r, t = aa(n, Z(n)).row.scrollableIndexAt(e, l + 1);
			if (t === null) return null;
			h = t;
		}
		let g;
		if (s < p) {
			g = -1;
			let e = 0;
			for (let t = 0; t < u; t++) if (e += m[t], s < e) {
				g = t + 1;
				break;
			}
			if (g === -1) return null;
		} else {
			let e = s - p + this.effectiveScrollLeft / r, t = aa(n, Z(n)).col.scrollableIndexAt(e, u + 1);
			if (t === null) return null;
			g = t;
		}
		return {
			row: h,
			col: g
		};
	}
	getCellRect(e, t) {
		let n = this.currentWorksheet;
		if (!n) return null;
		let r = this.opts.cellScale ?? 1, i = Z(n), a = (e) => Math.round(e * r), o = (e) => a(Q(n.colWidths[e] ?? n.defaultColWidth, i)), s = (e) => a($(n.rowHeights[e] ?? n.defaultRowHeight)), c = n.freezeRows ?? 0, l = n.freezeCols ?? 0, u;
		if (t <= l) {
			let e = a(50);
			for (let n = 1; n < t; n++) e += o(n);
			u = e;
		} else {
			let e = 0;
			for (let t = 1; t <= l; t++) e += o(t);
			let s = a(50) + e, c = this.effectiveScrollLeft / r, d = aa(n, i).col, { index: f, partial: p } = d.indexAt(c + d.offsetOf(l + 1)), m = s - p * r;
			if (t >= f) for (let e = f; e < t; e++) m += o(e);
			else for (let e = t; e < f; e++) m -= o(e);
			u = m;
		}
		let d;
		if (e <= c) {
			let t = a(22);
			for (let n = 1; n < e; n++) t += s(n);
			d = t;
		} else {
			let t = 0;
			for (let e = 1; e <= c; e++) t += s(e);
			let o = a(22) + t, l = this.scrollHost.scrollTop / r, u = aa(n, i).row, { index: f, partial: p } = u.indexAt(l + u.offsetOf(c + 1)), m = o - p * r;
			if (e >= f) for (let t = f; t < e; t++) m += s(t);
			else for (let t = e; t < f; t++) m -= s(t);
			d = m;
		}
		return {
			x: u,
			y: d,
			w: o(t),
			h: s(e)
		};
	}
	get selection() {
		return !this.anchorCell || !this.activeCell ? null : {
			anchor: this.anchorCell,
			active: this.activeCell,
			mode: this.selectionMode
		};
	}
	select(e) {
		let t = _n(e);
		t && (this.hideValidationPanel(), this.selectionMode = "cells", this.anchorCell = {
			row: t.row,
			col: t.col
		}, this.activeCell = {
			row: t.row,
			col: t.col
		}, this.updateSelectionOverlay(), this.renderCurrentSheet(), this.opts.onSelectionChange?.(this.selection));
	}
	getHeaderHit(e, t) {
		let n = this.currentWorksheet;
		if (!n) return null;
		let r = this.opts.cellScale ?? 1, i = this.canvasArea.getBoundingClientRect(), a = this.screenX(e - i.left, 0) / r, o = (t - i.top) / r, s = a < 50, c = o < 22;
		if (!s && !c) return null;
		if (s && c) return { kind: "corner" };
		let l = n.freezeRows ?? 0, u = n.freezeCols ?? 0;
		if (s) {
			let e = o - 22;
			if (e < 0) return { kind: "corner" };
			let t = 0, i = [];
			for (let e = 1; e <= l; e++) {
				let r = $(n.rowHeights[e] ?? n.defaultRowHeight);
				i.push(r), t += r;
			}
			if (e < t) {
				let t = 0;
				for (let n = 0; n < l; n++) if (t += i[n], e < t) return {
					kind: "row",
					row: n + 1
				};
				return null;
			}
			let a = e - t + this.scrollHost.scrollTop / r, s = aa(n, Z(n)).row.scrollableIndexAt(a, l + 1);
			return s === null ? null : {
				kind: "row",
				row: s
			};
		}
		let d = a - 50;
		if (d < 0) return { kind: "corner" };
		let f = 0, p = [];
		for (let e = 1; e <= u; e++) {
			let t = Q(n.colWidths[e] ?? n.defaultColWidth, Z(n));
			p.push(t), f += t;
		}
		if (d < f) {
			let e = 0;
			for (let t = 0; t < u; t++) if (e += p[t], d < e) return {
				kind: "col",
				col: t + 1
			};
			return null;
		}
		let m = d - f + this.effectiveScrollLeft / r, h = aa(n, Z(n)).col.scrollableIndexAt(m, u + 1);
		return h === null ? null : {
			kind: "col",
			col: h
		};
	}
	getResizeTarget(e, t) {
		let n = this.currentWorksheet;
		if (!n) return null;
		let r = this.opts.cellScale ?? 1, i = this.canvasArea.getBoundingClientRect(), a = this.screenX(e - i.left, 0), o = t - i.top, s = Math.round(50 * r), c = Math.round(22 * r), l = Z(n);
		if (o <= c && a > s) {
			let n = this.getHeaderHit(e, t);
			if (n?.kind !== "col") return null;
			let r = /* @__PURE__ */ new Map(), i = [];
			for (let e of [n.col - 1, n.col]) {
				if (e < 1) continue;
				let t = this.getCellRect(1, e);
				t && (r.set(e, t.x), i.push({
					index: e,
					edge: t.x + t.w
				}));
			}
			let o = na(a, i, ea, s);
			return o === null ? null : {
				kind: "col",
				index: o,
				originScaled: r.get(o),
				mdw: l
			};
		}
		if (a <= s && o > c) {
			let n = this.getHeaderHit(e, t);
			if (n?.kind !== "row") return null;
			let r = /* @__PURE__ */ new Map(), i = [];
			for (let e of [n.row - 1, n.row]) {
				if (e < 1) continue;
				let t = this.getCellRect(e, 1);
				t && (r.set(e, t.y), i.push({
					index: e,
					edge: t.y + t.h
				}));
			}
			let a = na(o, i, ea, c);
			return a === null ? null : {
				kind: "row",
				index: a,
				originScaled: r.get(a),
				mdw: l
			};
		}
		return null;
	}
	applyResize(e, t) {
		let n = this.resizeDrag, r = this.currentWorksheet;
		if (!n || !r) return;
		let i = this.opts.cellScale ?? 1, a = this.canvasArea.getBoundingClientRect();
		if (n.kind === "col") {
			let t = this.screenX(e - a.left, 0), o = Math.max(ta, Math.round((t - n.originScaled) / i));
			r.colWidths[n.index] = In(o, n.mdw), this.recordSizeOverride("col", n.index);
		} else {
			let e = t - a.top, o = Math.max(ta, Math.round((e - n.originScaled) / i));
			r.rowHeights[n.index] = Ln(o), this.recordSizeOverride("row", n.index);
		}
		ia.delete(r), this.updateSpacerSize(r), this.updateSelectionOverlay(), this.scheduleRender();
	}
	setSelectionColor(e) {
		this.opts.selectionColor = e, this.updateSelectionOverlay();
	}
	async setHiddenSheetMode(e) {
		this._hiddenSheetMode = e, this.buildTabs(), e === "skip" && this.wb && this.wb.isHidden(this.currentSheet) ? await this.showSheet(we(this.currentSheet, (e) => this.wb.isHidden(e), this.sheetCount)) : this.updateTabActive(this.currentSheet);
	}
	get hiddenSheetMode() {
		return this._hiddenSheetMode;
	}
	get visibleSheetCount() {
		if (!this.wb) return 0;
		let e = this.wb;
		return Te((t) => e.isHidden(t), this.sheetCount);
	}
	copySelection() {
		let e = this.currentWorksheet;
		if (!e || !this.anchorCell || !this.activeCell) return;
		let t = 1, n = 1;
		for (let r of e.rows) {
			r.index > t && (t = r.index);
			for (let e of r.cells) e.col > n && (n = e.col);
		}
		let r, i, a, o;
		this.selectionMode === "all" ? (r = 1, i = t, a = 1, o = n) : this.selectionMode === "rows" ? (r = Math.min(this.anchorCell.row, this.activeCell.row), i = Math.max(this.anchorCell.row, this.activeCell.row), a = 1, o = n) : this.selectionMode === "cols" ? (a = Math.min(this.anchorCell.col, this.activeCell.col), o = Math.max(this.anchorCell.col, this.activeCell.col), r = 1, i = t) : (r = Math.min(this.anchorCell.row, this.activeCell.row), i = Math.max(this.anchorCell.row, this.activeCell.row), a = Math.min(this.anchorCell.col, this.activeCell.col), o = Math.max(this.anchorCell.col, this.activeCell.col));
		let s = /* @__PURE__ */ new Map();
		for (let t of e.rows) if (!(t.index < r || t.index > i)) for (let e of t.cells) {
			if (e.col < a || e.col > o) continue;
			let n = e.value, r = "";
			n.type === "text" ? r = n.runs ? n.runs.map((e) => e.text).join("") : n.text : n.type === "number" ? r = String(n.number) : n.type === "bool" ? r = n.bool ? "TRUE" : "FALSE" : n.type === "error" && (r = n.error), r && s.set(`${t.index}:${e.col}`, r);
		}
		let c = [];
		for (let e = r; e <= i; e++) {
			let t = [];
			for (let n = a; n <= o; n++) t.push(s.get(`${e}:${n}`) ?? "");
			c.push(t.join("	"));
		}
		navigator.clipboard.writeText(c.join("\n")).catch(() => void 0);
	}
	updateSelectionOverlay() {
		if (this.selectionOverlay.innerHTML = "", !this.anchorCell || !this.activeCell) return;
		let e = this.opts.cellScale ?? 1, t = this.currentWorksheet, n = t?.freezeRows ?? 0, r = t?.freezeCols ?? 0, i = (t) => Math.round(t * e), a = i(50), o = i(22), s = 0;
		if (t) for (let e = 1; e <= n; e++) s += i($(t.rowHeights[e] ?? t.defaultRowHeight));
		let c = 0;
		if (t) for (let e = 1; e <= r; e++) c += i(Q(t.colWidths[e] ?? t.defaultColWidth, Z(t)));
		let l, u, d, f, p = 1, m = 1;
		if (this.selectionMode === "all") l = a, u = o, d = this.canvasArea.clientWidth - a, f = this.canvasArea.clientHeight - o;
		else if (this.selectionMode === "rows") {
			p = Math.min(this.anchorCell.row, this.activeCell.row);
			let e = Math.max(this.anchorCell.row, this.activeCell.row), t = this.getCellRect(p, 1), n = this.getCellRect(e, 1);
			if (!t || !n) return;
			l = a, u = t.y, d = this.canvasArea.clientWidth - a, f = n.y + n.h - t.y;
		} else if (this.selectionMode === "cols") {
			m = Math.min(this.anchorCell.col, this.activeCell.col);
			let e = Math.max(this.anchorCell.col, this.activeCell.col), t = this.getCellRect(1, m), n = this.getCellRect(1, e);
			if (!t || !n) return;
			l = t.x, u = o, d = n.x + n.w - t.x, f = this.canvasArea.clientHeight - o;
		} else {
			p = Math.min(this.anchorCell.row, this.activeCell.row);
			let e = Math.max(this.anchorCell.row, this.activeCell.row);
			m = Math.min(this.anchorCell.col, this.activeCell.col);
			let t = Math.max(this.anchorCell.col, this.activeCell.col), n = this.getCellRect(p, m), r = this.getCellRect(e, t);
			if (!n || !r) return;
			l = n.x, u = n.y, d = r.x + r.w - n.x, f = r.y + r.h - n.y;
		}
		l < a && (d -= a - l, l = a), u < o && (f -= o - u, u = o);
		let h = a + c, g = o + s;
		if (m > r && l < h && (d -= h - l, l = h), p > n && u < g && (f -= g - u, u = g), d <= 0 || f <= 0) return;
		let _ = this.screenX(l, d), { border: v, background: y } = ra(this.opts.selectionColor ?? $i), b = document.createElement("div");
		b.style.cssText = `position:absolute;left:${_}px;top:${u}px;width:${d}px;height:${f}px;box-sizing:border-box;border:${v};background:${y};pointer-events:none;`, this.selectionOverlay.appendChild(b), this.maybeDrawValidationDropdown();
	}
	maybeDrawValidationDropdown() {
		if (this.validationArrowRect = null, this.selectionMode !== "cells") return;
		let e = this.currentWorksheet, t = this.activeCell;
		if (!e || !t || !ki(e.dataValidations, t.row, t.col)) return;
		let n = this.getCellRect(t.row, t.col);
		if (!n) return;
		let r = this.opts.cellScale ?? 1, i = Math.round(50 * r), a = Math.round(22 * r), o = Math.max(14, Math.min(n.h, 22 * r)), s = n.x + n.w, c = n.y;
		if (s + o <= i || c + o <= a) return;
		let l = this.screenX(s, o), u = document.createElement("div");
		u.setAttribute("data-xlsx-validation-dropdown", ""), u.style.cssText = `position:absolute;left:${l}px;top:${c}px;width:${o}px;height:${o}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:#f0f0f0;border:1px solid #7f7f7f;pointer-events:none;`;
		let d = Math.max(4, Math.round(o * .42));
		u.innerHTML = `<svg width="${d}" height="${d}" viewBox="0 0 10 6" aria-hidden="true"><path d="M0 0 L10 0 L5 6 Z" fill="#333"/></svg>`, this.selectionOverlay.appendChild(u), this.validationArrowRect = {
			x: l,
			y: c,
			w: o,
			h: o
		}, this.validationPanel.style.display !== "none" && (this.validationPanelKey === `${t.row}:${t.col}` ? this.positionValidationPanel() : this.hideValidationPanel());
	}
	updateFindOverlay() {
		this.findOverlay.innerHTML = "";
		let e = this.currentWorksheet;
		if (!e) return;
		let t = this.opts.cellScale ?? 1, n = (e) => Math.round(e * t), r = n(50), i = n(22), a = e.freezeRows ?? 0, o = e.freezeCols ?? 0, s = 0;
		for (let t = 1; t <= o; t++) s += n(Q(e.colWidths[t] ?? e.defaultColWidth, Z(e)));
		let c = 0;
		for (let t = 1; t <= a; t++) c += n($(e.rowHeights[t] ?? e.defaultRowHeight));
		let l = r + s, u = i + c, d = ra("#ffb300"), f = ra("#fb8c00");
		for (let e of this._find.sheetHighlights(this.currentSheet)) {
			let t = this.getCellRect(e.row, e.col);
			if (!t) continue;
			let { x: n, y: s, w: c, h: p } = t;
			if (n < r && (c -= r - n, n = r), s < i && (p -= i - s, s = i), e.col > o && n < l && (c -= l - n, n = l), e.row > a && s < u && (p -= u - s, s = u), c <= 0 || p <= 0) continue;
			let m = this.screenX(n, c), { border: h, background: g } = e.active ? f : d, _ = document.createElement("div");
			_.style.cssText = `position:absolute;left:${m}px;top:${s}px;width:${c}px;height:${p}px;box-sizing:border-box;border:${h};background:${g};pointer-events:none;`, this.findOverlay.appendChild(_);
		}
	}
	async findText(e, t = {}) {
		if (!this.wb) return [];
		let n = await this._find.find(e, t);
		return this.updateFindOverlay(), n;
	}
	async findNext() {
		return this._activateMatch(this._find.next());
	}
	async findPrev() {
		return this._activateMatch(this._find.prev());
	}
	clearFind() {
		this._find.invalidate(), this.updateFindOverlay();
	}
	async _activateMatch(e) {
		if (!e) return this.updateFindOverlay(), null;
		let { sheet: t, row: n, col: r } = e.location;
		return t !== this.currentSheet && await this.goToSheet(t), this._scrollCellIntoView(n, r), this.updateFindOverlay(), e;
	}
	_scrollCellIntoView(e, t) {
		let n = this.currentWorksheet;
		if (!n) return;
		let r = this.opts.cellScale ?? 1, i = Z(n), a = aa(n, i), o = n.freezeRows ?? 0, s = n.freezeCols ?? 0;
		if (e > o) {
			let t = Math.round(22 * r), i = 0;
			for (let e = 1; e <= o; e++) i += Math.round($(n.rowHeights[e] ?? n.defaultRowHeight) * r);
			let s = t + i, c = this.canvasArea.clientHeight, l = a.row.offsetOf(e) - a.row.offsetOf(o + 1), u = $(n.rowHeights[e] ?? n.defaultRowHeight), d = s + (l * r - this.scrollHost.scrollTop), f = d + u * r;
			d < s ? this.scrollHost.scrollTop = l * r : f > c && (this.scrollHost.scrollTop = l * r - (c - s - u * r));
		}
		if (t > s) {
			let e = Math.round(50 * r), o = 0;
			for (let e = 1; e <= s; e++) o += Math.round(Q(n.colWidths[e] ?? n.defaultColWidth, i) * r);
			let c = e + o, l = this.canvasArea.clientWidth, u = a.col.offsetOf(t) - a.col.offsetOf(s + 1), d = Q(n.colWidths[t] ?? n.defaultColWidth, i), f = c + (u * r - this.effectiveScrollLeft), p = f + d * r, m = this.effectiveScrollLeft;
			f < c ? m = u * r : p > l && (m = u * r - (l - c - d * r)), m = Math.max(0, m), this.effectiveH = m, this.scrollHost.scrollLeft = this.isRtl ? Math.max(0, this.maxScrollLeft - m) : m;
		}
	}
	toggleValidationPanel() {
		let e = this.currentWorksheet, t = this.activeCell;
		if (!e || !t) return;
		let n = `${t.row}:${t.col}`;
		if (this.validationPanelKey === n && this.validationPanel.style.display !== "none") {
			this.hideValidationPanel();
			return;
		}
		let r = ki(e.dataValidations, t.row, t.col);
		r && this.openValidationPanel(t, r.formula1);
	}
	async openValidationPanel(e, t) {
		let n;
		try {
			n = await this.workbook.resolveValidationList(this.currentSheet, t);
		} catch {
			n = {
				kind: "formula",
				formula: t ?? ""
			};
		}
		let r = this.activeCell;
		!r || r.row !== e.row || r.col !== e.col || (this.validationPanelKey = `${e.row}:${e.col}`, this.renderValidationPanel(n), this.positionValidationPanel(), this.installValidationOutsideHandler());
	}
	renderValidationPanel(e) {
		let t = this.validationPanel;
		if (t.textContent = "", e.kind === "formula" || e.values.length === 0) {
			let n = document.createElement("div");
			n.style.cssText = "padding:4px 8px;color:#666;font-style:italic;white-space:pre-wrap;word-break:break-word;", n.textContent = e.kind === "formula" ? e.formula ? `= ${e.formula}` : "(no list)" : "(empty list)", t.appendChild(n);
			return;
		}
		for (let n of e.values) {
			let e = document.createElement("div");
			e.setAttribute("data-xlsx-validation-item", ""), e.style.cssText = "padding:3px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default;", e.textContent = n, e.addEventListener("pointerenter", () => {
				e.style.background = "#cfe3ff";
			}), e.addEventListener("pointerleave", () => {
				e.style.background = "";
			}), t.appendChild(e);
		}
	}
	positionValidationPanel() {
		let e = this.activeCell;
		if (!e) return;
		let t = this.getCellRect(e.row, e.col);
		if (!t) return;
		let n = this.screenX(t.x, t.w);
		this.validationPanel.style.left = "-9999px", this.validationPanel.style.top = "-9999px", this.validationPanel.style.display = "block";
		let r = Ei({
			cell: {
				x: n,
				y: t.y,
				w: t.w,
				h: t.h
			},
			panel: {
				w: this.validationPanel.offsetWidth,
				h: this.validationPanel.offsetHeight
			},
			viewport: {
				w: this.canvasArea.clientWidth,
				h: this.canvasArea.clientHeight
			},
			rtl: this.isRtl
		});
		this.validationPanel.style.left = `${r.left}px`, this.validationPanel.style.top = `${r.top}px`;
	}
	installValidationOutsideHandler() {
		this.validationOutsideHandler || (this.validationOutsideHandler = (e) => {
			let t = e.target;
			if (t && this.validationPanel.contains(t)) return;
			let n = this.canvasArea.getBoundingClientRect(), r = e.clientX - n.left, i = e.clientY - n.top, a = this.validationArrowRect;
			a && r >= a.x && r <= a.x + a.w && i >= a.y && i <= a.y + a.h || this.hideValidationPanel();
		}, document.addEventListener("pointerdown", this.validationOutsideHandler, !0));
	}
	hideValidationPanel() {
		this.validationPanel.style.display = "none", this.validationPanelKey = null, this.validationOutsideHandler &&= (document.removeEventListener("pointerdown", this.validationOutsideHandler, !0), null);
	}
	buildCommentMap(e) {
		this.commentMap = /* @__PURE__ */ new Map();
		for (let t of e.comments ?? []) {
			let e = _n(t.cellRef);
			e && this.commentMap.set(`${e.row}:${e.col}`, t);
		}
	}
	buildHyperlinkMap(e) {
		this.hyperlinkMap = /* @__PURE__ */ new Map();
		for (let t of e.hyperlinks ?? []) this.hyperlinkMap.set(`${t.row}:${t.col}`, t);
	}
	hyperlinkAtCell(e) {
		return this.opts.enableHyperlinks === !1 ? null : this.hyperlinkMap.get(`${e.row}:${e.col}`) ?? null;
	}
	dispatchHyperlink(e) {
		let t = this.hyperlinkAtCell(e);
		if (!t) return !1;
		let n;
		if (t.url) n = {
			kind: "external",
			url: t.url
		};
		else if (t.location) n = {
			kind: "internal",
			ref: t.location
		};
		else return !1;
		let r = this.opts.onHyperlinkClick;
		return r ? (r(n), !0) : (n.kind === "external" ? ae(n.url) : this.navigateInternalHyperlink(n.ref), !0);
	}
	navigateInternalHyperlink(e) {
		let t = e.lastIndexOf("!");
		if (t < 0) return;
		let n = e.slice(0, t);
		n.startsWith("'") && n.endsWith("'") && (n = n.slice(1, -1).replace(/''/g, "'"));
		let r = this.sheetNames.indexOf(n);
		r >= 0 && this.goToSheet(r);
	}
	scheduleCommentPopup(e) {
		let t = `${e.row}:${e.col}`, n = this.commentMap.get(t);
		if (!n) {
			this.hideCommentPopup();
			return;
		}
		this.commentPopupKey !== t && (this.hideCommentPopup(), this.commentPopupKey = t, this.commentPopupTimer = setTimeout(() => {
			this.commentPopupTimer = null, this.renderCommentPopup(e, n);
		}, Vi));
	}
	renderCommentPopup(e, t) {
		let n = this.getCellRect(e.row, e.col);
		if (!n) return;
		if (this.commentPopup.textContent = "", t.author) {
			let e = document.createElement("div");
			e.style.cssText = "font-weight:bold;margin-bottom:2px;", e.textContent = t.author, this.commentPopup.appendChild(e);
		}
		let r = document.createElement("div");
		r.textContent = t.text, this.commentPopup.appendChild(r);
		let i = this.screenX(n.x, n.w);
		this.commentPopup.style.left = "-9999px", this.commentPopup.style.top = "-9999px", this.commentPopup.style.display = "block";
		let a = ji({
			cell: {
				x: i,
				y: n.y,
				w: n.w,
				h: n.h
			},
			popup: {
				w: this.commentPopup.offsetWidth,
				h: this.commentPopup.offsetHeight
			},
			viewport: {
				w: this.canvasArea.clientWidth,
				h: this.canvasArea.clientHeight
			},
			rtl: this.isRtl
		});
		this.commentPopup.style.left = `${a.left}px`, this.commentPopup.style.top = `${a.top}px`;
	}
	hideCommentPopup() {
		this.commentPopupTimer !== null && (clearTimeout(this.commentPopupTimer), this.commentPopupTimer = null), this.commentPopupKey = null, this.commentPopup.style.display = "none";
	}
	applyPointerSelection(e, t, n, r, i) {
		let a = this.getHeaderHit(e, t);
		if (a) {
			a.kind === "corner" ? (this.selectionMode = "all", this.anchorCell = {
				row: 1,
				col: 1
			}, this.activeCell = {
				row: 1,
				col: 1
			}, this.isSelecting = !1) : a.kind === "row" ? n && this.anchorCell && this.selectionMode === "rows" ? this.activeCell = {
				row: a.row,
				col: 1
			} : (this.selectionMode = "rows", this.anchorCell = {
				row: a.row,
				col: 1
			}, this.activeCell = {
				row: a.row,
				col: 1
			}, i && (this.isSelecting = !0, this.scrollHost.setPointerCapture(r))) : n && this.anchorCell && this.selectionMode === "cols" ? this.activeCell = {
				row: 1,
				col: a.col
			} : (this.selectionMode = "cols", this.anchorCell = {
				row: 1,
				col: a.col
			}, this.activeCell = {
				row: 1,
				col: a.col
			}, i && (this.isSelecting = !0, this.scrollHost.setPointerCapture(r))), this.updateSelectionOverlay(), this.renderCurrentSheet(), this.opts.onSelectionChange?.(this.selection);
			return;
		}
		let o = this.getCellAt(e, t);
		o && (n && this.anchorCell && this.selectionMode === "cells" ? this.activeCell = o : (this.selectionMode = "cells", this.anchorCell = o, this.activeCell = o), i && (this.isSelecting = !0, this.scrollHost.setPointerCapture(r)), this.updateSelectionOverlay(), this.renderCurrentSheet(), this.opts.onSelectionChange?.(this.selection));
	}
	setupSelectionEvents() {
		this.scrollHost.addEventListener("pointerdown", (e) => {
			if (e.button !== 0) return;
			let t = this.opts.resizable ?? !0 ? this.getResizeTarget(e.clientX, e.clientY) : null;
			if (t) {
				e.preventDefault(), this.resizeDrag = {
					...t,
					pointerId: e.pointerId
				}, this.scrollHost.setPointerCapture(e.pointerId), this.hideCommentPopup();
				return;
			}
			let n = this.validationArrowRect;
			if (n) {
				let t = this.canvasArea.getBoundingClientRect(), r = e.clientX - t.left, i = e.clientY - t.top;
				if (r >= n.x && r <= n.x + n.w && i >= n.y && i <= n.y + n.h) {
					e.preventDefault(), this.toggleValidationPanel();
					return;
				}
			}
			let r = this.scrollHost.getBoundingClientRect(), i = e.clientX - r.left - this.scrollHost.clientLeft, a = e.clientY - r.top - this.scrollHost.clientTop;
			if (i >= this.scrollHost.clientWidth || a >= this.scrollHost.clientHeight) return;
			let o = this.scrollHost.scrollWidth > this.scrollHost.clientWidth && this.scrollHost.clientHeight - a <= 16 || this.scrollHost.scrollHeight > this.scrollHost.clientHeight && this.scrollHost.clientWidth - i <= 16;
			if (e.pointerType !== "mouse" || o) {
				this.pendingTap = {
					x: e.clientX,
					y: e.clientY,
					shiftKey: e.shiftKey,
					pointerId: e.pointerId
				};
				return;
			}
			let s = this.getCellAt(e.clientX, e.clientY);
			this.pendingClick = s ? {
				x: e.clientX,
				y: e.clientY,
				pointerId: e.pointerId,
				cell: s
			} : null, this.applyPointerSelection(e.clientX, e.clientY, e.shiftKey, e.pointerId, !0);
		}), this.scrollHost.addEventListener("pointermove", (e) => {
			if (this.resizeDrag && this.resizeDrag.pointerId === e.pointerId) {
				e.preventDefault(), this.applyResize(e.clientX, e.clientY);
				return;
			}
			if (e.pointerType === "mouse" && !this.isSelecting && (this.opts.resizable ?? !0)) {
				let t = this.getResizeTarget(e.clientX, e.clientY);
				if (this.scrollHost.style.cursor = t ? t.kind === "col" ? "col-resize" : "row-resize" : "", t) {
					this.hideCommentPopup();
					return;
				}
			}
			if (this.pendingTap && this.pendingTap.pointerId === e.pointerId) {
				let t = e.clientX - this.pendingTap.x, n = e.clientY - this.pendingTap.y;
				t * t + n * n > 64 && (this.pendingTap = null);
			}
			if (this.pendingClick && this.pendingClick.pointerId === e.pointerId) {
				let t = e.clientX - this.pendingClick.x, n = e.clientY - this.pendingClick.y;
				t * t + n * n > 64 && (this.pendingClick = null);
			}
			if (e.pointerType === "mouse" && !this.isSelecting) {
				let t = this.getCellAt(e.clientX, e.clientY);
				t ? this.scheduleCommentPopup(t) : this.hideCommentPopup(), this.scrollHost.style.cursor = t && this.hyperlinkAtCell(t) ? "pointer" : "";
			}
			if (this.isSelecting) {
				if (this.selectionMode === "rows") {
					let t = this.getHeaderHit(e.clientX, e.clientY), n = t?.kind === "row" ? t.row : this.getCellAt(e.clientX, e.clientY)?.row;
					if (!n || n === this.activeCell?.row) return;
					this.activeCell = {
						row: n,
						col: 1
					};
				} else if (this.selectionMode === "cols") {
					let t = this.getHeaderHit(e.clientX, e.clientY), n = t?.kind === "col" ? t.col : this.getCellAt(e.clientX, e.clientY)?.col;
					if (!n || n === this.activeCell?.col) return;
					this.activeCell = {
						row: 1,
						col: n
					};
				} else {
					let t = this.getCellAt(e.clientX, e.clientY);
					if (!t || t.row === this.activeCell?.row && t.col === this.activeCell?.col) return;
					this.activeCell = t;
				}
				this.updateSelectionOverlay(), this.scheduleRender(), this.opts.onSelectionChange?.(this.selection);
			}
		}), this.scrollHost.addEventListener("pointerup", (e) => {
			if (this.resizeDrag && this.resizeDrag.pointerId === e.pointerId) {
				this.scrollHost.releasePointerCapture(e.pointerId), this.resizeDrag = null;
				return;
			}
			if (this.pendingTap && this.pendingTap.pointerId === e.pointerId) {
				let t = e.clientX - this.pendingTap.x, n = e.clientY - this.pendingTap.y;
				if (t * t + n * n <= 64) {
					if (this.applyPointerSelection(e.clientX, e.clientY, this.pendingTap.shiftKey, e.pointerId, !1), e.pointerType !== "mouse" && this.activeCell) {
						let e = `${this.activeCell.row}:${this.activeCell.col}`, t = this.commentMap.get(e);
						t ? (this.hideCommentPopup(), this.renderCommentPopup(this.activeCell, t)) : this.hideCommentPopup();
					}
					this.activeCell && this.dispatchHyperlink(this.activeCell);
				}
				this.pendingTap = null;
			}
			if (this.pendingClick && this.pendingClick.pointerId === e.pointerId) {
				let t = e.clientX - this.pendingClick.x, n = e.clientY - this.pendingClick.y, r = this.getCellAt(e.clientX, e.clientY);
				t * t + n * n <= 64 && r && r.row === this.pendingClick.cell.row && r.col === this.pendingClick.cell.col && this.dispatchHyperlink(this.pendingClick.cell), this.pendingClick = null;
			}
			this.isSelecting = !1;
		}), this.scrollHost.addEventListener("pointercancel", (e) => {
			this.resizeDrag && this.resizeDrag.pointerId === e.pointerId && (this.resizeDrag = null), this.pendingTap && this.pendingTap.pointerId === e.pointerId && (this.pendingTap = null), this.pendingClick && this.pendingClick.pointerId === e.pointerId && (this.pendingClick = null), this.isSelecting = !1;
		}), this.scrollHost.addEventListener("wheel", (e) => {
			if (!(e.ctrlKey || e.metaKey) || (e.preventDefault(), e.deltaY === 0)) return;
			let t = this.canvasArea.getBoundingClientRect(), n = e.clientX - t.left, r = e.clientY - t.top;
			this._pendingZoomAnchor = Number.isFinite(n) && Number.isFinite(r) ? {
				x: n,
				y: r
			} : null, this.setScale(U(this.opts.cellScale ?? 1, e.deltaY));
		}, { passive: !1 }), this.scrollHost.addEventListener("pointerleave", () => this.hideCommentPopup()), this.keydownHandler = (e) => {
			(e.ctrlKey || e.metaKey) && e.key === "c" ? this.copySelection() : e.key === "Escape" && this.validationPanel.style.display !== "none" && this.hideValidationPanel();
		}, document.addEventListener("keydown", this.keydownHandler);
	}
	buildTabs() {
		this.tabStrip.innerHTML = "", this.tabs = [], this.tabColors = this.workbook.tabColors, this.workbook.sheetNames.forEach((e, t) => {
			let n = document.createElement("button");
			n.textContent = e, n.title = e, n.style.cssText = this.tabCss(t, !1), n.addEventListener("click", () => this.showSheet(t)), this.tabStrip.appendChild(n), this.tabs.push(n);
		}), this.updateNavButtons();
	}
	makeNavButton(e, t, n) {
		let r = document.createElement("button");
		return r.textContent = e, r.setAttribute("aria-label", t), r.title = t, r.classList.add("xlsx-tab-nav"), r.style.cssText = this.navButtonStyle(!1), r.addEventListener("click", n), r;
	}
	navButtonStyle(e) {
		return e ? "flex:1;height:100%;padding:0;display:flex;align-items:center;justify-content:center;border:none;color:#666;font-size:9px;line-height:1;box-sizing:border-box;outline:none;opacity:0.3;cursor:default;pointer-events:none;" : "flex:1;height:100%;padding:0;display:flex;align-items:center;justify-content:center;border:none;color:#666;font-size:9px;line-height:1;box-sizing:border-box;outline:none;cursor:pointer;";
	}
	scrollTabs(e) {
		let t = this.tabStrip, n = t.scrollLeft, r = n + t.clientWidth, i = null;
		if (e === 1) for (let e of this.tabs) {
			let n = e.offsetLeft + e.offsetWidth;
			if (n > r + 1) {
				i = n - t.clientWidth;
				break;
			}
		}
		else for (let e = this.tabs.length - 1; e >= 0; e--) {
			let t = this.tabs[e].offsetLeft;
			if (t < n - 1) {
				i = t;
				break;
			}
		}
		i !== null && (t.scrollLeft = Math.max(0, i)), this.updateNavButtons();
	}
	updateNavButtons() {
		let e = this.tabStrip, t = e.scrollLeft <= 0, n = e.scrollLeft + e.clientWidth >= e.scrollWidth - 1;
		this.navPrev.style.cssText = this.navButtonStyle(t), this.navNext.style.cssText = this.navButtonStyle(n);
	}
	updateTabActive(e) {
		this.tabs.forEach((t, n) => {
			t.style.cssText = this.tabCss(n, n === e);
		});
		let t = this.tabs[e];
		if (t && t.offsetParent !== null) {
			let e = this.tabStrip, n = t.getBoundingClientRect(), r = e.getBoundingClientRect();
			n.left < r.left ? e.scrollLeft -= r.left - n.left : n.right > r.right && (e.scrollLeft += n.right - r.right);
		}
	}
	tabStyle(e, t) {
		let n = Ki - 2, r = Ki - 5, i = t ? `box-shadow:inset 0 -${e ? 2 : 3}px 0 0 ${t};` : "";
		return e ? `display:inline-block;flex:none;padding:0 14px;position:relative;border:1px solid #c8ccd0;border-bottom:none;border-radius:3px 3px 0 0;cursor:pointer;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;outline:none;box-sizing:border-box;height:${n}px;font-size:13px;background:#fff;color:#000;border-bottom:1px solid #fff;font-weight:600;top:1px;` + i : `display:inline-block;flex:none;padding:0 14px;position:relative;border:1px solid #c8ccd0;border-bottom:none;border-radius:3px 3px 0 0;cursor:pointer;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;outline:none;box-sizing:border-box;height:${r}px;font-size:11px;background:#e0e0e0;color:#555;` + i;
	}
	tabCss(e, t) {
		let n = this.tabStyle(t, this.tabColors[e]);
		return this._hiddenSheetMode !== "show" && this.wb?.isHidden(e) && (n += this._hiddenSheetMode === "skip" ? "display:none;" : `opacity:${Ji};`), n;
	}
	buildZoomControl() {
		let e = this.opts.zoomMin ?? .1, t = this.opts.zoomMax ?? 4, n = this.opts.cellScale ?? 1, r = document.createElement("div");
		r.style.cssText = "display:flex;align-items:center;flex-shrink:0;gap:2px;padding:0 10px;height:100%;color:#555;font-size:12px;user-select:none;";
		let i = (e, t, n) => {
			let r = document.createElement("button");
			return r.type = "button", r.textContent = e, r.setAttribute("aria-label", t), r.title = t, r.style.cssText = "width:18px;height:18px;padding:0;border:none;background:transparent;color:#555;font-size:14px;line-height:1;cursor:pointer;border-radius:3px;", r.addEventListener("click", n), r;
		}, a = document.createElement("input");
		a.type = "range", a.min = "0", a.max = "100", a.step = "any", a.value = String(this.zoomScaleToPos(n, e, t)), a.setAttribute("aria-label", "Zoom"), a.title = "Zoom", a.classList.add("xlsx-zoom-slider"), a.style.cssText = "width:90px;cursor:pointer;", a.addEventListener("input", () => this.setScale(this.zoomPosToScale(Number(a.value), e, t)));
		let o = document.createElement("span");
		return o.textContent = `${Math.round(n * 100)}%`, o.style.cssText = "min-width:42px;margin-left:6px;text-align:right;font-variant-numeric:tabular-nums;", r.appendChild(i("−", "Zoom out", () => this.zoomOut())), r.appendChild(a), r.appendChild(i("+", "Zoom in", () => this.zoomIn())), r.appendChild(o), this.zoomSlider = a, this.zoomLabel = o, r;
	}
	zoomPosToScale(e, t, n) {
		return e <= 50 ? t + e / 50 * (1 - t) : 1 + (e - 50) / 50 * (n - 1);
	}
	zoomScaleToPos(e, t, n) {
		let r = Math.min(n, Math.max(t, e));
		return r <= 1 ? (r - t) / (1 - t) * 50 : 50 + (r - 1) / (n - 1) * 50;
	}
	setScale(e) {
		let t = this.opts.zoomMin ?? .1, n = this.opts.zoomMax ?? 4, r = Math.min(Math.round(n * 100), Math.max(Math.round(t * 100), Math.round(e * 100))), i = r / 100, a = this.opts.cellScale ?? 1, o = this._pendingZoomAnchor;
		if (this._pendingZoomAnchor = null, i !== a) {
			if (this.opts.cellScale = i, this.zoomSlider && (this.zoomSlider.value = String(this.zoomScaleToPos(i, t, n))), this.zoomLabel && (this.zoomLabel.textContent = `${r}%`), this.navGroup.style.width = `${Math.round(50 * i)}px`, this.currentWorksheet) {
				let e = this.effectiveScrollLeft, t = this.scrollHost.scrollTop;
				if (this.layoutGutters(), this.updateSpacerSize(this.currentWorksheet), o) {
					let n = Math.max(0, this.scrollHost.scrollHeight - this.scrollHost.clientHeight);
					this.scrollHost.scrollTop = se(t, o.y, a, i, { maxScroll: n });
					let r = this.screenX(o.x, 0), s = this.maxScrollLeft, c = se(e, r, a, i, { maxScroll: s });
					this.effectiveH = c, this.scrollHost.scrollLeft = this.isRtl ? Math.max(0, s - c) : c;
				} else this.effectiveH = e, this.isRtl && (this.scrollHost.scrollLeft = Math.max(0, this.maxScrollLeft - e));
			}
			this.renderCurrentSheet(), this.updateSelectionOverlay(), this.updateFindOverlay(), this.updateNavButtons(), this.opts.onScaleChange?.(i);
		}
	}
	getScale() {
		return this.opts.cellScale ?? 1;
	}
	zoomIn() {
		this.setScale(H(this.getScale()));
	}
	zoomOut() {
		this.setScale(de(this.getScale()));
	}
	fitWidth() {
		this._fit("width");
	}
	fitPage() {
		this._fit("page");
	}
	_fit(e) {
		let t = this.currentWorksheet;
		if (!t) return;
		let { width: n, height: r } = this._naturalContentExtent(t), i = B({
			contentWidth: n,
			contentHeight: r,
			containerWidth: this.canvasArea.clientWidth,
			containerHeight: this.canvasArea.clientHeight
		}, e);
		i <= 0 || this.setScale(i);
	}
	_naturalContentExtent(e) {
		let t = Z(e), n = Math.max(50, e.freezeRows ?? 0), r = Math.max(26, e.freezeCols ?? 0);
		for (let t of e.rows) {
			t.index > n && (n = t.index);
			for (let e of t.cells) e.col > r && (r = e.col);
		}
		let i = 50;
		for (let n = 1; n <= r; n++) i += Q(e.colWidths[n] ?? e.defaultColWidth, t);
		let a = 22;
		for (let t = 1; t <= n; t++) a += $(e.rowHeights[t] ?? e.defaultRowHeight);
		return {
			width: i,
			height: a
		};
	}
	updateSpacerSize(e) {
		let t = this.opts.cellScale ?? 1, n = Z(e), r = (e) => Math.round(e * t), i = e.freezeRows ?? 0, a = e.freezeCols ?? 0, o = Math.max(50, i), s = Math.max(26, a);
		for (let t of e.rows) {
			t.index > o && (o = t.index);
			for (let e of t.cells) e.col > s && (s = e.col);
		}
		o += 30, s += 10;
		let c = r(50);
		for (let t = 1; t <= s; t++) c += r(Q(e.colWidths[t] ?? e.defaultColWidth, n));
		let l = r(22);
		for (let t = 1; t <= o; t++) l += r($(e.rowHeights[t] ?? e.defaultRowHeight));
		this.spacer.style.width = `${c}px`, this.spacer.style.height = `${l}px`;
	}
	scheduleRender() {
		if (this._rafId === null) {
			if (typeof requestAnimationFrame != "function") {
				this.renderCurrentSheet();
				return;
			}
			this._rafId = requestAnimationFrame(() => {
				this._rafId = null, this.renderCurrentSheet();
			});
		}
	}
	async renderCurrentSheet() {
		try {
			await this._renderCurrentSheet();
		} catch (e) {
			this._reportRenderError(e);
		}
	}
	_reportRenderError(e) {
		if (this._destroyed) return;
		let t = e instanceof Error ? e : Error(String(e));
		this.opts.onError ? this.opts.onError(t) : console.error("[ooxml] XlsxViewer render failed:", t);
	}
	async _renderCurrentSheet() {
		if (!this.currentWorksheet) return;
		let e = this.currentWorksheet, t = this.canvasArea.clientWidth, n = this.canvasArea.clientHeight;
		if (t <= 0 || n <= 0) return;
		let r = ++this._renderSeq, i = this.opts.cellScale ?? 1, a = window.devicePixelRatio ?? 1, o = e.freezeRows ?? 0, s = e.freezeCols ?? 0, c = 0;
		for (let t = 1; t <= s; t++) c += Q(e.colWidths[t] ?? e.defaultColWidth, Z(e));
		let l = 0;
		for (let t = 1; t <= o; t++) l += $(e.rowHeights[t] ?? e.defaultRowHeight);
		let u = this.effectiveScrollLeft / i, d = this.scrollHost.scrollTop / i, f = aa(e, Z(e)), { index: p, partial: m } = f.col.indexAt(u + f.col.offsetOf(s + 1)), { index: h, partial: g } = f.row.indexAt(d + f.row.offsetOf(o + 1)), _ = t / i - 50 - c, v = n / i - 22 - l, y = 0;
		{
			let t = -m, n = p;
			for (; t < _ + m && n <= 16384;) t += Q(e.colWidths[n] ?? e.defaultColWidth, Z(e)), y++, n++;
			y += 2;
		}
		let b = 0;
		{
			let t = -g, n = h;
			for (; t < v + g && n <= 1048576;) t += $(e.rowHeights[n] ?? e.defaultRowHeight), b++, n++;
			b += 2;
		}
		let x = {
			row: h,
			col: p,
			rows: b,
			cols: y
		}, { selectedRowRange: S, selectedColRange: C } = this.computeHeaderHighlight(), w = {
			width: t,
			height: n,
			dpr: a,
			cellScale: i,
			scrollOffsetX: m,
			scrollOffsetY: g,
			freezeRows: o,
			freezeCols: s,
			selectedRowRange: S,
			selectedColRange: C
		};
		if (this._mode === "worker") {
			let e = this.wireSizeOverrides(), i = await this.workbook.renderViewportToBitmap(this.currentSheet, x, e ? {
				...w,
				sizeOverrides: e
			} : w);
			if (r !== this._renderSeq) {
				i.close();
				return;
			}
			this.canvas.width !== i.width && (this.canvas.width = i.width), this.canvas.height !== i.height && (this.canvas.height = i.height);
			let a = `${t}px`, o = `${n}px`;
			this.canvas.style.width !== a && (this.canvas.style.width = a), this.canvas.style.height !== o && (this.canvas.style.height = o), this._bitmapCtx?.transferFromImageBitmap(i);
		} else await this.workbook.renderViewport(this.canvas, this.currentSheet, x, w);
		this.renderGutters();
	}
	computeHeaderHighlight() {
		if (!this.anchorCell || !this.activeCell) return {
			selectedRowRange: null,
			selectedColRange: null
		};
		let e = 2 ** 53 - 1, t = Math.min(this.anchorCell.row, this.activeCell.row), n = Math.max(this.anchorCell.row, this.activeCell.row), r = Math.min(this.anchorCell.col, this.activeCell.col), i = Math.max(this.anchorCell.col, this.activeCell.col);
		switch (this.selectionMode) {
			case "cells": return {
				selectedRowRange: {
					start: t,
					end: n,
					strong: !1
				},
				selectedColRange: {
					start: r,
					end: i,
					strong: !1
				}
			};
			case "rows": return {
				selectedRowRange: {
					start: t,
					end: n,
					strong: !0
				},
				selectedColRange: {
					start: 1,
					end: e,
					strong: !1
				}
			};
			case "cols": return {
				selectedRowRange: {
					start: 1,
					end: e,
					strong: !1
				},
				selectedColRange: {
					start: r,
					end: i,
					strong: !0
				}
			};
			case "all": return {
				selectedRowRange: {
					start: 1,
					end: e,
					strong: !0
				},
				selectedColRange: {
					start: 1,
					end: e,
					strong: !0
				}
			};
		}
	}
	get sheetNames() {
		return this.wb?.sheetNames ?? [];
	}
	get canvasElement() {
		return this.canvas;
	}
	destroy() {
		this._destroyed = !0, this._loadGen++, this.resizeObserver?.disconnect(), this._rafId !== null && typeof cancelAnimationFrame == "function" && (cancelAnimationFrame(this._rafId), this._rafId = null), this._renderSeq++, this.hideCommentPopup(), this.hideValidationPanel(), this.keydownHandler && document.removeEventListener("keydown", this.keydownHandler), this._find.invalidate(), this.wb?.destroy(), this.wrapper.remove();
	}
}, sa = /* @__PURE__ */ e({
	OoxmlError: () => F,
	XlsxViewer: () => oa,
	XlsxWorkbook: () => Di,
	autoResize: () => L,
	openExternalHyperlink: () => ae,
	resolveSharedStrings: () => Ci
});
//#endregion
export { Ci as i, oa as n, Di as r, sa as t };
