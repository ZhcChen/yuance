import { t as e } from "./chunk-DmhlhrBa.js";
import { t } from "./slide-pull-client-DKckZrLx.js";
import { B as n, Et as r, F as i, H as a, I as o, It as s, Lt as c, P as l, R as u, U as d, W as ee, at as f, gn as p, kt as m, ot as h, q as te, rt as g, st as ne } from "./line-metrics-z9AdgPaZ.js";
import { t as re } from "./bounded-raw-part-cache-C6ro6Ezf.js";
import { a as ie, c as ae, i as oe, l as se, r as ce, u as le } from "./document-pull-client-xsdVDuVD.js";
import { t as ue } from "./transfer-DCu4c2BL.js";
import { a as de, c as fe, d as pe, l as me, o as he, r as ge, s as _e, t as ve, u as ye } from "./worksheet-pull-client-CMDRPZ5E.js";
import { a as be, i as xe, n as Se, r as Ce } from "./session-BOuXp10X.js";
import { a as we, n as Te, r as Ee, t as De } from "./render-yhFUeiYl.js";
import { existsSync as Oe, readFileSync as ke } from "node:fs";
import { fileURLToPath as Ae } from "node:url";
import { basename as je, dirname as Me, resolve as Ne } from "node:path";
import { createRequire as Pe } from "node:module";
//#region packages/core/src/internal/owned-session.ts
async function _(e, t) {
	let n = await e(), r;
	try {
		return await t(n);
	} catch (e) {
		throw r = e, e;
	} finally {
		try {
			await n.close();
		} catch (e) {
			if (r === void 0) throw e;
		}
	}
}
//#endregion
//#region packages/core/src/internal/in-process-pull-transport.ts
var v = class {
	nextRequestId = 1;
	terminated = !1;
	constructor(e, t) {
		this.dispatch = e, this.terminateHost = t;
	}
	async request(e, t, n) {
		if (this.terminated) throw Error("pull transport terminated");
		if (n?.signal?.aborted) {
			n.onCancel?.(this.nextRequestId, "abort");
			let e = /* @__PURE__ */ Error("worker request aborted");
			throw e.name = "AbortError", e;
		}
		let r = e(this.nextRequestId++), i;
		if (await this.dispatch(r, (e) => {
			i = e;
		}), i === void 0) throw Error("in-process pull host did not respond");
		return i;
	}
	forgetOrphaned(e) {}
	terminate() {
		this.terminated || (this.terminated = !0, this.terminateHost());
	}
};
//#endregion
//#region packages/node/src/wasm-loader.ts
function Fe(e) {
	return new WebAssembly.Module(ke(e));
}
function y(e, t = Fe) {
	let n = {};
	return () => n.value ??= t(e());
}
function Ie(e, t, n) {
	let r = Me(Ae(e)), i = Ne(r, t);
	if (Oe(i)) return i;
	let a = Ne(r, je(t));
	return Oe(a) || !n ? a : Pe(e).resolve(n);
}
//#endregion
//#region packages/node/src/pptx.ts
var Le = y(() => Ie(import.meta.url, "pptx_parser_bg.wasm", "@silurus/ooxml-pptx/wasm-binary"));
async function Re(e, t = {}) {
	return ze(e, t);
}
async function ze(e, t = {}) {
	let n = await Se(He(e), Le(), t);
	return new Be(n.closeArchive, n.archive, n.bootstrap, n.metrics, t.signal);
}
var Be = class {
	slideCount;
	slideWidth;
	slideHeight;
	slidePull;
	slideClient;
	transport;
	started = !1;
	closed = !1;
	closePromise;
	usage;
	consumedSlides = 0;
	resourceFailure;
	renderTail = Promise.resolve();
	fetchImage = (e, t) => this.getPartInternal(e, t, (t) => t.extract_image(e));
	fetchMedia = (e) => this.getPartInternal(e, "application/octet-stream", (t) => t.extract_media(e));
	rawParts = new re({
		maxEntries: 64,
		maxBytes: te
	});
	constructor(e, n, r, i, a) {
		this.closeArchive = e, this.archive = n, this.bootstrap = r, this.metrics = i, this.signal = a, this.slideCount = r.slideCount, this.slideWidth = r.slideWidth, this.slideHeight = r.slideHeight, this.slidePull = new xe(() => this.archive), this.transport = new v((e, t) => this.slidePull.dispatchSafely(e, t), () => void 0), this.slideClient = new t({
			slideCount: this.slideCount,
			transport: this.transport,
			open: async (e, t) => {
				this.slidePull.reserveOpen(t), await this.slidePull.open(e, t);
			},
			onUsage: (e) => {
				this.usage = e, this.metrics.observeUsage(e);
			}
		});
	}
	materialize(e) {
		return {
			slideWidth: this.slideWidth,
			slideHeight: this.slideHeight,
			slides: e,
			defaultTextColor: this.bootstrap.defaultTextColor,
			majorFont: this.bootstrap.majorFont,
			minorFont: this.bootstrap.minorFont,
			...this.bootstrap.hlinkColor ? { hlinkColor: this.bootstrap.hlinkColor } : {},
			...this.bootstrap.folHlinkColor ? { folHlinkColor: this.bootstrap.folHlinkColor } : {}
		};
	}
	get resourceUsage() {
		return this.closed ? this.usage : this.refreshResourceUsage();
	}
	async getImage(e, t) {
		return this.assertOpen(), this.getPartInternal(e, t, (t) => t.extract_image(e)).catch((e) => this.failOperation(e));
	}
	async getMedia(e, t = "application/octet-stream") {
		return this.assertOpen(), this.getPartInternal(e, t, (t) => t.extract_media(e)).catch((e) => this.failOperation(e));
	}
	async renderSlide(e, t, n) {
		return this.assertOpen(), this.enqueueRender(async () => {
			b(this.signal);
			let { renderSlideNode: r } = await import("./render-yhFUeiYl.js").then((e) => e.i);
			await r(e, {
				slideWidth: this.slideWidth,
				slideHeight: this.slideHeight,
				slides: [t],
				defaultTextColor: this.bootstrap.defaultTextColor,
				majorFont: this.bootstrap.majorFont,
				minorFont: this.bootstrap.minorFont,
				...this.bootstrap.hlinkColor ? { hlinkColor: this.bootstrap.hlinkColor } : {},
				...this.bootstrap.folHlinkColor ? { folHlinkColor: this.bootstrap.folHlinkColor } : {}
			}, 0, {
				...n,
				fetchImage: this.fetchImage,
				fetchMedia: this.fetchMedia
			}), b(this.signal);
		}).catch((e) => this.failOperation(e));
	}
	[Symbol.asyncIterator]() {
		return this.slides();
	}
	async *slides() {
		if (this.closed) throw Error("PPTX presentation session is closed");
		if (this.started) throw Error("PPTX presentation session is one-pass and was already consumed");
		this.started = !0;
		let e;
		try {
			for (let e = 0; e < this.slideCount; e += 1) {
				b(this.signal);
				let t = await this.slideClient.load(e);
				if (!t) throw Error(`PPTX slide ${e} was not decoded`);
				this.usage ??= await this.slidePull.run(() => be((e) => e(this.archive))), this.metrics.observeUsage(this.usage), this.consumedSlides = e + 1, yield t;
			}
		} catch (t) {
			throw e = f(t) ?? t, this.metrics.fail(e), e;
		} finally {
			try {
				await this.close();
			} catch (t) {
				if (e === void 0) throw t;
			}
		}
	}
	close() {
		return this.closePromise ? this.closePromise : (this.closed = !0, this.slideClient.cancelAll(), this.closePromise = this.release(), this.closePromise);
	}
	async release() {
		let e;
		await this.renderTail, m(this.fetchImage), r(this.fetchImage);
		try {
			await this.slidePull.reset();
		} catch (t) {
			e = f(t) ?? t;
		}
		this.transport.terminate(), this.rawParts.clear();
		try {
			this.closeArchive();
		} catch (t) {
			e ??= f(t) ?? t;
		}
		if (e !== void 0) throw this.metrics.fail(e), e;
		this.metrics.checkpoint("presentation session closed"), this.metrics.succeed({ slides: this.consumedSlides });
	}
	enqueueRender(e) {
		let t = this.renderTail.then(e, e);
		return this.renderTail = t.then(() => void 0, () => void 0), t;
	}
	getPartInternal(e, t, n) {
		return this.rawParts.get(e, t, () => {
			b(this.signal);
			let e = n(this.archive);
			return this.refreshResourceUsage(), new Blob([e], { type: t });
		});
	}
	refreshResourceUsage() {
		try {
			this.usage = g(this.archive.resource_usage()), this.metrics.observeUsage(this.usage);
		} catch {}
		return this.usage;
	}
	assertOpen() {
		if (this.closed) throw Error("PPTX presentation session is closed");
		if (this.resourceFailure) throw this.resourceFailure;
	}
	failOperation(e) {
		let t = f(e) ?? e;
		throw t instanceof p && (this.resourceFailure ??= t), this.metrics.fail(t), t;
	}
};
async function Ve(e, t = {}) {
	return _(() => ze(e, t), async (e) => {
		let t = [];
		for await (let n of e.slides()) t.push(n);
		return e.materialize(t);
	});
}
function He(e) {
	return e instanceof Uint8Array ? e : new Uint8Array(e);
}
function b(e) {
	if (!e?.aborted) return;
	let t = /* @__PURE__ */ Error("PPTX presentation session was aborted");
	throw t.name = "AbortError", t;
}
//#endregion
//#region packages/docx/src/document-pull-worker.ts
var Ue = Math.max(d, ee), We = class {
	coordinator = new o();
	host = null;
	identity = null;
	constructor(e, t = (e) => e(this.requireArchive())) {
		this.archive = e, this.executeArchive = t;
	}
	open(e) {
		if (this.host) throw Error("a DOCX document pull session is already active");
		this.executeArchive((t) => {
			t.open_document_cursor(e.operationId, e.generation);
		});
		let t = 0;
		this.identity = e, this.host = new i({
			...e,
			maxByteCredit: Ue,
			coordinator: this.coordinator,
			driver: {
				pull: (n) => {
					let r;
					try {
						r = this.executeArchive((r) => r.pull_document_chunk(t, e.operationId, e.generation, n));
					} catch (e) {
						throw ne(e, n, Ue) || e;
					}
					let i = ue(r);
					return {
						payload: i,
						byteLength: i.byteLength,
						done: this.executeArchive((e) => e.document_chunk_done()),
						transfer: [i]
					};
				},
				measureChunk: ({ payload: e }) => e.byteLength,
				acknowledge: (n) => {
					if (n !== t) throw Error("DOCX document acknowledgement sequence mismatch");
					this.executeArchive((n) => n.acknowledge_document_chunk(t, e.operationId, e.generation)), t += 1;
				},
				cancel: () => this.executeArchive((e) => e.cancel_document_cursor()),
				close: () => this.executeArchive((e) => e.close_document_session()),
				resourceUsage: () => {
					let e = this.executeArchive((e) => e.document_cursor_resource_usage?.());
					return e ? g(e) : void 0;
				}
			}
		});
	}
	dispatch(e, t) {
		return !this.host || !this.identity ? (t({
			protocol: l,
			kind: "error",
			sessionId: e.sessionId,
			operationId: e.operationId,
			generation: e.generation,
			requestId: e.requestId,
			error: h(/* @__PURE__ */ Error("DOCX document pull session is not open"))
		}), Promise.resolve()) : this.host.dispatch(e, t);
	}
	async reset() {
		if (this.host) try {
			this.archive() && this.executeArchive((e) => e.close_document_session());
		} finally {
			this.host = null, this.identity = null, this.coordinator = new o();
		}
	}
	requireArchive() {
		let e = this.archive();
		if (!e) throw Error("No docx loaded");
		return e;
	}
}, Ge = /* @__PURE__ */ e({
	DocxArchive: () => x,
	default: () => rt,
	docx_to_markdown: () => Ke,
	extract_image: () => qe,
	initSync: () => nt,
	parse_docx: () => Je,
	reinit: () => it
}), x = class {
	__destroy_into_raw() {
		let e = this.__wbg_ptr;
		return this.__wbg_ptr = 0, Xe.unregister(this), e;
	}
	free() {
		let e = this.__destroy_into_raw();
		F.__wbg_docxarchive_free(e, 0);
	}
	acknowledge_document_chunk(e, t, n) {
		let r = F.docxarchive_acknowledge_document_chunk(this.__wbg_ptr, e, t, n);
		if (r[1]) throw A(r[0]);
	}
	assert_healthy() {
		let e = F.docxarchive_assert_healthy(this.__wbg_ptr);
		if (e[1]) throw A(e[0]);
	}
	cancel_document_cursor() {
		F.docxarchive_cancel_document_cursor(this.__wbg_ptr);
	}
	close_document_session() {
		F.docxarchive_close_document_session(this.__wbg_ptr);
	}
	document_chunk_done() {
		let e = F.docxarchive_document_chunk_done(this.__wbg_ptr);
		if (e[2]) throw A(e[1]);
		return e[0] !== 0;
	}
	document_cursor_resource_usage() {
		let e = F.docxarchive_document_cursor_resource_usage(this.__wbg_ptr);
		if (e[3]) throw A(e[2]);
		var t = S(e[0], e[1]).slice();
		return F.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	extract_image(e) {
		let t = k(e, F.__wbindgen_malloc, F.__wbindgen_realloc), n = P, r = F.docxarchive_extract_image(this.__wbg_ptr, t, n);
		if (r[3]) throw A(r[2]);
		var i = S(r[0], r[1]).slice();
		return F.__wbindgen_free(r[0], r[1] * 1, 1), i;
	}
	constructor(e, t, n, r) {
		let i = O(e, F.__wbindgen_malloc), a = P, o = F.docxarchive_new(i, a, !D(t), D(t) ? BigInt(0) : t, !D(n), D(n) ? BigInt(0) : n, !D(r), D(r) ? BigInt(0) : r);
		if (o[2]) throw A(o[1]);
		return this.__wbg_ptr = o[0] >>> 0, Xe.register(this, this.__wbg_ptr, this), this;
	}
	open_document_cursor(e, t) {
		let n = F.docxarchive_open_document_cursor(this.__wbg_ptr, e, t);
		if (n[1]) throw A(n[0]);
	}
	parse() {
		let e = F.docxarchive_parse(this.__wbg_ptr);
		if (e[3]) throw A(e[2]);
		var t = S(e[0], e[1]).slice();
		return F.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	pull_document_chunk(e, t, n, r) {
		let i = F.docxarchive_pull_document_chunk(this.__wbg_ptr, e, t, n, r);
		if (i[3]) throw A(i[2]);
		var a = S(i[0], i[1]).slice();
		return F.__wbindgen_free(i[0], i[1] * 1, 1), a;
	}
	resource_usage() {
		let e = F.docxarchive_resource_usage(this.__wbg_ptr);
		if (e[3]) throw A(e[2]);
		var t = S(e[0], e[1]).slice();
		return F.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	to_markdown() {
		let e, t;
		try {
			let i = F.docxarchive_to_markdown(this.__wbg_ptr);
			var n = i[0], r = i[1];
			if (i[3]) throw n = 0, r = 0, A(i[2]);
			return e = n, t = r, w(n, r);
		} finally {
			F.__wbindgen_free(e, t, 1);
		}
	}
};
Symbol.dispose && (x.prototype[Symbol.dispose] = x.prototype.free);
function Ke(e, t, n) {
	let r, i;
	try {
		let s = O(e, F.__wbindgen_malloc), c = P, l = F.docx_to_markdown(s, c, !D(t), D(t) ? BigInt(0) : t, !D(n), D(n) ? BigInt(0) : n);
		var a = l[0], o = l[1];
		if (l[3]) throw a = 0, o = 0, A(l[2]);
		return r = a, i = o, w(a, o);
	} finally {
		F.__wbindgen_free(r, i, 1);
	}
}
function qe(e, t, n, r) {
	let i = O(e, F.__wbindgen_malloc), a = P, o = k(t, F.__wbindgen_malloc, F.__wbindgen_realloc), s = P, c = F.extract_image(i, a, o, s, !D(n), D(n) ? BigInt(0) : n, !D(r), D(r) ? BigInt(0) : r);
	if (c[3]) throw A(c[2]);
	var l = S(c[0], c[1]).slice();
	return F.__wbindgen_free(c[0], c[1] * 1, 1), l;
}
function Je(e, t, n) {
	let r = O(e, F.__wbindgen_malloc), i = P, a = F.parse_docx(r, i, !D(t), D(t) ? BigInt(0) : t, !D(n), D(n) ? BigInt(0) : n);
	if (a[3]) throw A(a[2]);
	var o = S(a[0], a[1]).slice();
	return F.__wbindgen_free(a[0], a[1] * 1, 1), o;
}
function Ye() {
	return {
		__proto__: null,
		"./docx_parser_bg.js": {
			__proto__: null,
			__wbg___wbindgen_throw_6b64449b9b9ed33c: function(e, t) {
				throw Error(w(e, t));
			},
			__wbg_error_a6fa202b58aa1cd3: function(e, t) {
				let n, r;
				try {
					n = e, r = t, console.error(w(e, t));
				} finally {
					F.__wbindgen_free(n, r, 1);
				}
			},
			__wbg_new_227d7c05414eb861: function() {
				return /* @__PURE__ */ Error();
			},
			__wbg_stack_3b0d974bbf31e44f: function(e, t) {
				let n = t.stack, r = k(n, F.__wbindgen_malloc, F.__wbindgen_realloc), i = P;
				Ze().setInt32(e + 4, i, !0), Ze().setInt32(e + 0, r, !0);
			},
			__wbindgen_cast_0000000000000001: function(e, t) {
				return w(e, t);
			},
			__wbindgen_init_externref_table: function() {
				let e = F.__wbindgen_externrefs, t = e.grow(4);
				e.set(0, void 0), e.set(t + 0, void 0), e.set(t + 1, null), e.set(t + 2, !0), e.set(t + 3, !1);
			}
		}
	};
}
var Xe = typeof FinalizationRegistry > "u" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((e) => F.__wbg_docxarchive_free(e >>> 0, 1));
function S(e, t) {
	return e >>>= 0, E().subarray(e / 1, e / 1 + t);
}
var C = null;
function Ze() {
	return (C === null || C.buffer.detached === !0 || C.buffer.detached === void 0 && C.buffer !== F.memory.buffer) && (C = new DataView(F.memory.buffer)), C;
}
function w(e, t) {
	return e >>>= 0, $e(e, t);
}
var T = null;
function E() {
	return (T === null || T.byteLength === 0) && (T = new Uint8Array(F.memory.buffer)), T;
}
function D(e) {
	return e == null;
}
function O(e, t) {
	let n = t(e.length * 1, 1) >>> 0;
	return E().set(e, n / 1), P = e.length, n;
}
function k(e, t, n) {
	if (n === void 0) {
		let n = N.encode(e), r = t(n.length, 1) >>> 0;
		return E().subarray(r, r + n.length).set(n), P = n.length, r;
	}
	let r = e.length, i = t(r, 1) >>> 0, a = E(), o = 0;
	for (; o < r; o++) {
		let t = e.charCodeAt(o);
		if (t > 127) break;
		a[i + o] = t;
	}
	if (o !== r) {
		o !== 0 && (e = e.slice(o)), i = n(i, r, r = o + e.length * 3, 1) >>> 0;
		let t = E().subarray(i + o, i + r), a = N.encodeInto(e, t);
		o += a.written, i = n(i, r, o, 1) >>> 0;
	}
	return P = o, i;
}
function A(e) {
	let t = F.__wbindgen_externrefs.get(e);
	return F.__externref_table_dealloc(e), t;
}
var j = new TextDecoder("utf-8", {
	ignoreBOM: !0,
	fatal: !0
});
j.decode();
var Qe = 2146435072, M = 0;
function $e(e, t) {
	return M += t, M >= Qe && (j = new TextDecoder("utf-8", {
		ignoreBOM: !0,
		fatal: !0
	}), j.decode(), M = t), j.decode(E().subarray(e, e + t));
}
var N = new TextEncoder();
"encodeInto" in N || (N.encodeInto = function(e, t) {
	let n = N.encode(e);
	return t.set(n), {
		read: e.length,
		written: n.length
	};
});
var P = 0, F;
function et(e, t) {
	return F = e.exports, C = null, T = null, F.__wbindgen_start(), F;
}
async function tt(e, t) {
	if (typeof Response == "function" && e instanceof Response) {
		if (typeof WebAssembly.instantiateStreaming == "function") try {
			return await WebAssembly.instantiateStreaming(e, t);
		} catch (t) {
			if (e.ok && n(e.type) && e.headers.get("Content-Type") !== "application/wasm") console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", t);
			else throw t;
		}
		let r = await e.arrayBuffer();
		return await WebAssembly.instantiate(r, t);
	} else {
		let n = await WebAssembly.instantiate(e, t);
		return n instanceof WebAssembly.Instance ? {
			instance: n,
			module: e
		} : n;
	}
	function n(e) {
		switch (e) {
			case "basic":
			case "cors":
			case "default": return !0;
		}
		return !1;
	}
}
function nt(e) {
	if (F !== void 0) return F;
	e !== void 0 && (Object.getPrototypeOf(e) === Object.prototype ? {module: e} = e : console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));
	let t = Ye();
	return e instanceof WebAssembly.Module || (e = new WebAssembly.Module(e)), et(new WebAssembly.Instance(e, t), e);
}
async function rt(e) {
	if (F !== void 0) return F;
	e !== void 0 && (Object.getPrototypeOf(e) === Object.prototype ? {module_or_path: e} = e : console.warn("using deprecated parameters for the initialization function; pass a single object instead"));
	let t = Ye();
	(typeof e == "string" || typeof Request == "function" && e instanceof Request || typeof URL == "function" && e instanceof URL) && (e = fetch(e));
	let { instance: n, module: r } = await tt(await e, t);
	return et(n, r);
}
async function it(e) {
	return F = void 0, C = null, T = null, rt(e);
}
//#endregion
//#region packages/docx/src/internal/node-acquisition.ts
var at, I;
function ot(e) {
	if (!I) at = e, I = new Ce(Ge, e);
	else if (at !== e) throw Error("DOCX runtime was already initialized with another WebAssembly.Module");
	return I;
}
async function st(e, t, r, i) {
	let o = n(r), s = new u({
		enabled: o.debug || o.onResourceMetrics !== void 0,
		format: "docx",
		mode: "node",
		scope: "session",
		policy: o.policy,
		onMetrics: o.onResourceMetrics,
		emitToConsole: o.debug
	});
	s.setSourceBytes(e.byteLength);
	let c, l, d;
	try {
		lt(r.signal);
		let [n, u, ee] = a(o.policy), f = x;
		c = await ot(t).open(() => new f(e, n, u, ee), {
			signal: r.signal,
			abortError: ut,
			disposeOnAbort: (e) => e.free()
		}), lt(r.signal);
		let p = c.proxy;
		s.checkpoint("container ready"), l = new We(() => p);
		let m = {
			sessionId: 1,
			operationId: 1,
			generation: 1
		};
		l.open(m), d = new v((e, t) => l?.dispatch(e, t), () => void 0);
		let h, te = await i(d, m, {
			signal: r.signal,
			onUsage: (e) => {
				h = e, s.observeUsage(e);
			}
		});
		return h ??= ct(p.document_cursor_resource_usage()), s.observeUsage(h), s.checkpoint("model streamed"), await l.reset(), d.terminate(), {
			archive: p,
			result: te,
			usage: h,
			metrics: s,
			closeArchive: () => c?.close((e) => e.free())
		};
	} catch (e) {
		await l?.reset().catch(() => void 0), d?.terminate();
		try {
			c?.close((e) => e.free());
		} catch {}
		let t = f(e) ?? e;
		throw s.fail(t), t;
	}
}
function ct(e) {
	try {
		return g(e);
	} catch {
		return;
	}
}
function lt(e) {
	if (e?.aborted) throw ut();
}
function ut() {
	let e = /* @__PURE__ */ Error("DOCX document session was aborted");
	return e.name = "AbortError", e;
}
//#endregion
//#region packages/node/src/docx.ts
var dt = y(() => Ie(import.meta.url, "docx_parser_bg.wasm", "@silurus/ooxml-docx/wasm-binary"));
async function ft(e, t) {
	if (!t?.factory) throw TypeError("openDocxDocument requires a canvas factory");
	let n = await st(gt(e), dt(), t, (e, t, n) => ce(e, t, n));
	try {
		L(t.signal);
		let e = t.factory.createCanvas(1, 1), r = se(n.result, { measureContext: e.getContext("2d") }), i = ht(t.currentDate), a = ie(n.result, r, i).layoutVariants.defaultLayout, o = new mt(n.closeArchive, n.archive, n.result, r, a, t.factory, i, n.usage, n.metrics, t.signal);
		return n.metrics.observeUsage(o.resourceUsage), n.metrics.checkpoint("pagination ready"), o;
	} catch (e) {
		try {
			n.closeArchive();
		} catch {}
		let t = f(e) ?? e;
		throw n.metrics.fail(t), t;
	}
}
async function pt(e, t = {}) {
	return _(async () => {
		let n = await st(gt(e), dt(), t, (e, t, n) => oe(e, t, n)), r = !1;
		return {
			acquired: n,
			markSucceeded: () => {
				r = !0;
			},
			close: async () => {
				try {
					n.closeArchive(), r && n.metrics.succeed({ documents: 1 });
				} catch (e) {
					throw n.metrics.fail(e), e;
				}
			}
		};
	}, async ({ acquired: e, markSucceeded: t }) => {
		try {
			let n = le(e.result);
			return e.metrics.checkpoint("document materialized", e.usage), t(), n;
		} catch (t) {
			throw e.metrics.fail(t), t;
		}
	});
}
var mt = class {
	pageCount;
	sizes;
	lastResourceUsage;
	state;
	renderTail = Promise.resolve();
	pagesStarted = !1;
	closed = !1;
	closePromise;
	resourceFailure = null;
	fetchImage = async (e, t) => {
		let n = this.archive.extract_image(e);
		return new Blob([n], { type: t });
	};
	constructor(e, t, n, r, i, a, o, s, c, l) {
		this.closeArchive = e, this.archive = t, this.factory = a, this.defaultCurrentDateMs = o, this.metrics = c, this.signal = l, this.state = {
			source: n,
			services: r
		}, this.pageCount = i.pages.length, this.lastResourceUsage = s, this.sizes = Object.freeze(i.pages.map((e) => Object.freeze({
			widthPt: e.geometry.widthPt,
			heightPt: e.geometry.heightPt
		})));
	}
	get resourceUsage() {
		return this.closed ? this.lastResourceUsage : this.refreshResourceUsage();
	}
	refreshResourceUsage() {
		try {
			this.lastResourceUsage = g(this.archive.resource_usage()), this.metrics.observeUsage(this.lastResourceUsage);
		} catch {}
		return this.lastResourceUsage;
	}
	pageSize(e) {
		let t = this.sizes[e];
		if (!t) throw RangeError(`DOCX page index ${e} out of range`);
		return t;
	}
	[Symbol.asyncIterator]() {
		return this.pages();
	}
	renderPage(e, t = {}) {
		return this.closed ? Promise.reject(/* @__PURE__ */ Error("DOCX document session is closed")) : this.resourceFailure ? Promise.reject(this.resourceFailure) : (this.pageSize(e), this.enqueueRender(async () => {
			L(this.signal);
			let n = this.requireState(), r = this.factory.createCanvas(1, 1);
			return await we(this.factory, () => ae(n.source, r, e, {
				...t,
				currentDate: this.defaultCurrentDateMs,
				defaultCurrentDateMs: this.defaultCurrentDateMs,
				layoutServices: n.services,
				fetchImage: this.fetchImage
			})), L(this.signal), r;
		}).catch((e) => {
			let t = f(e) ?? e;
			throw t instanceof p && (this.resourceFailure ??= t), this.metrics.fail(t), t;
		}));
	}
	async *pages(e = {}) {
		if (this.closed) throw Error("DOCX document session is closed");
		if (this.pagesStarted) throw Error("DOCX page stream is one-pass and was already consumed");
		this.pagesStarted = !0;
		let t;
		try {
			for (let t = 0; t < this.pageCount; t += 1) {
				let n = await this.renderPage(t, e), r = this.pageSize(t);
				yield {
					pageIndex: t,
					...r,
					canvas: n
				};
			}
		} catch (e) {
			throw t = f(e) ?? e, t;
		} finally {
			try {
				await this.close();
			} catch (e) {
				if (t === void 0) throw e;
			}
		}
	}
	close() {
		return this.closePromise ? this.closePromise : (this.refreshResourceUsage(), this.closed = !0, this.closePromise = this.release(), this.closePromise);
	}
	enqueueRender(e) {
		let t = this.renderTail.then(e, e);
		return this.renderTail = t.then(() => void 0, () => void 0), t;
	}
	async release() {
		await this.renderTail, m(this.fetchImage), r(this.fetchImage), this.state = null;
		try {
			this.closeArchive();
		} catch (e) {
			let t = f(e) ?? e;
			throw this.metrics.fail(t), t;
		}
		this.metrics.checkpoint("document session closed", this.lastResourceUsage), this.metrics.succeed({ pages: this.pageCount });
	}
	requireState() {
		if (!this.state) throw Error("DOCX document session is closed");
		return this.state;
	}
};
function ht(e) {
	let t = e instanceof Date ? e.getTime() : e ?? Date.now();
	if (!Number.isFinite(t)) throw RangeError("currentDate must resolve to finite epoch milliseconds");
	return t;
}
function gt(e) {
	return e instanceof Uint8Array ? e : new Uint8Array(e);
}
function L(e) {
	if (!e?.aborted) return;
	let t = /* @__PURE__ */ Error("DOCX document session was aborted");
	throw t.name = "AbortError", t;
}
//#endregion
//#region packages/xlsx/src/wasm/xlsx_parser.js
var _t = /* @__PURE__ */ e({
	XlsxArchive: () => R,
	default: () => kt,
	extract_image: () => vt,
	initSync: () => Ot,
	parse_xlsx: () => yt,
	reinit: () => At,
	xlsx_to_markdown: () => bt
}), R = class {
	__destroy_into_raw() {
		let e = this.__wbg_ptr;
		return this.__wbg_ptr = 0, St.unregister(this), e;
	}
	free() {
		let e = this.__destroy_into_raw();
		Q.__wbg_xlsxarchive_free(e, 0);
	}
	acknowledge_sheet_cursor_terminal() {
		let e = Q.xlsxarchive_acknowledge_sheet_cursor_terminal(this.__wbg_ptr);
		if (e[1]) throw q(e[0]);
	}
	assert_healthy() {
		let e = Q.xlsxarchive_assert_healthy(this.__wbg_ptr);
		if (e[1]) throw q(e[0]);
	}
	cancel_sheet_cursor() {
		Q.xlsxarchive_cancel_sheet_cursor(this.__wbg_ptr);
	}
	close_sheet_cursor() {
		Q.xlsxarchive_close_sheet_cursor(this.__wbg_ptr);
	}
	extract_image(e) {
		let t = K(e, Q.__wbindgen_malloc, Q.__wbindgen_realloc), n = Z, r = Q.xlsxarchive_extract_image(this.__wbg_ptr, t, n);
		if (r[3]) throw q(r[2]);
		var i = z(r[0], r[1]).slice();
		return Q.__wbindgen_free(r[0], r[1] * 1, 1), i;
	}
	constructor(e, t, n, r) {
		let i = G(e, Q.__wbindgen_malloc), a = Z, o = Q.xlsxarchive_new(i, a, !W(t), W(t) ? BigInt(0) : t, !W(n), W(n) ? BigInt(0) : n, !W(r), W(r) ? BigInt(0) : r);
		if (o[2]) throw q(o[1]);
		return this.__wbg_ptr = o[0] >>> 0, St.register(this, this.__wbg_ptr, this), this;
	}
	open_sheet_cursor(e, t) {
		let n = K(t, Q.__wbindgen_malloc, Q.__wbindgen_realloc), r = Z, i = Q.xlsxarchive_open_sheet_cursor(this.__wbg_ptr, e, n, r);
		if (i[1]) throw q(i[0]);
	}
	parse() {
		let e = Q.xlsxarchive_parse(this.__wbg_ptr);
		if (e[3]) throw q(e[2]);
		var t = z(e[0], e[1]).slice();
		return Q.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	pull_sheet_cursor(e) {
		let t = Q.xlsxarchive_pull_sheet_cursor(this.__wbg_ptr, e);
		if (t[3]) throw q(t[2]);
		var n = z(t[0], t[1]).slice();
		return Q.__wbindgen_free(t[0], t[1] * 1, 1), n;
	}
	resource_usage() {
		let e = Q.xlsxarchive_resource_usage(this.__wbg_ptr);
		if (e[3]) throw q(e[2]);
		var t = z(e[0], e[1]).slice();
		return Q.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	sheet_cursor_pull_finished() {
		return Q.xlsxarchive_sheet_cursor_pull_finished(this.__wbg_ptr) !== 0;
	}
	sheet_cursor_resource_usage() {
		let e = Q.xlsxarchive_sheet_cursor_resource_usage(this.__wbg_ptr);
		if (e[3]) throw q(e[2]);
		var t = z(e[0], e[1]).slice();
		return Q.__wbindgen_free(e[0], e[1] * 1, 1), t;
	}
	to_markdown() {
		let e, t;
		try {
			let i = Q.xlsxarchive_to_markdown(this.__wbg_ptr);
			var n = i[0], r = i[1];
			if (i[3]) throw n = 0, r = 0, q(i[2]);
			return e = n, t = r, V(n, r);
		} finally {
			Q.__wbindgen_free(e, t, 1);
		}
	}
};
Symbol.dispose && (R.prototype[Symbol.dispose] = R.prototype.free);
function vt(e, t, n, r) {
	let i = G(e, Q.__wbindgen_malloc), a = Z, o = K(t, Q.__wbindgen_malloc, Q.__wbindgen_realloc), s = Z, c = Q.extract_image(i, a, o, s, !W(n), W(n) ? BigInt(0) : n, !W(r), W(r) ? BigInt(0) : r);
	if (c[3]) throw q(c[2]);
	var l = z(c[0], c[1]).slice();
	return Q.__wbindgen_free(c[0], c[1] * 1, 1), l;
}
function yt(e, t, n) {
	let r = G(e, Q.__wbindgen_malloc), i = Z, a = Q.parse_xlsx(r, i, !W(t), W(t) ? BigInt(0) : t, !W(n), W(n) ? BigInt(0) : n);
	if (a[3]) throw q(a[2]);
	var o = z(a[0], a[1]).slice();
	return Q.__wbindgen_free(a[0], a[1] * 1, 1), o;
}
function bt(e, t, n) {
	let r, i;
	try {
		let s = G(e, Q.__wbindgen_malloc), c = Z, l = Q.xlsx_to_markdown(s, c, !W(t), W(t) ? BigInt(0) : t, !W(n), W(n) ? BigInt(0) : n);
		var a = l[0], o = l[1];
		if (l[3]) throw a = 0, o = 0, q(l[2]);
		return r = a, i = o, V(a, o);
	} finally {
		Q.__wbindgen_free(r, i, 1);
	}
}
function xt() {
	return {
		__proto__: null,
		"./xlsx_parser_bg.js": {
			__proto__: null,
			__wbg___wbindgen_throw_6b64449b9b9ed33c: function(e, t) {
				throw Error(V(e, t));
			},
			__wbg_error_a6fa202b58aa1cd3: function(e, t) {
				let n, r;
				try {
					n = e, r = t, console.error(V(e, t));
				} finally {
					Q.__wbindgen_free(n, r, 1);
				}
			},
			__wbg_new_227d7c05414eb861: function() {
				return /* @__PURE__ */ Error();
			},
			__wbg_stack_3b0d974bbf31e44f: function(e, t) {
				let n = t.stack, r = K(n, Q.__wbindgen_malloc, Q.__wbindgen_realloc), i = Z;
				Ct().setInt32(e + 4, i, !0), Ct().setInt32(e + 0, r, !0);
			},
			__wbindgen_cast_0000000000000001: function(e, t) {
				return V(e, t);
			},
			__wbindgen_init_externref_table: function() {
				let e = Q.__wbindgen_externrefs, t = e.grow(4);
				e.set(0, void 0), e.set(t + 0, void 0), e.set(t + 1, null), e.set(t + 2, !0), e.set(t + 3, !1);
			}
		}
	};
}
var St = typeof FinalizationRegistry > "u" ? {
	register: () => {},
	unregister: () => {}
} : new FinalizationRegistry((e) => Q.__wbg_xlsxarchive_free(e >>> 0, 1));
function z(e, t) {
	return e >>>= 0, U().subarray(e / 1, e / 1 + t);
}
var B = null;
function Ct() {
	return (B === null || B.buffer.detached === !0 || B.buffer.detached === void 0 && B.buffer !== Q.memory.buffer) && (B = new DataView(Q.memory.buffer)), B;
}
function V(e, t) {
	return e >>>= 0, Tt(e, t);
}
var H = null;
function U() {
	return (H === null || H.byteLength === 0) && (H = new Uint8Array(Q.memory.buffer)), H;
}
function W(e) {
	return e == null;
}
function G(e, t) {
	let n = t(e.length * 1, 1) >>> 0;
	return U().set(e, n / 1), Z = e.length, n;
}
function K(e, t, n) {
	if (n === void 0) {
		let n = X.encode(e), r = t(n.length, 1) >>> 0;
		return U().subarray(r, r + n.length).set(n), Z = n.length, r;
	}
	let r = e.length, i = t(r, 1) >>> 0, a = U(), o = 0;
	for (; o < r; o++) {
		let t = e.charCodeAt(o);
		if (t > 127) break;
		a[i + o] = t;
	}
	if (o !== r) {
		o !== 0 && (e = e.slice(o)), i = n(i, r, r = o + e.length * 3, 1) >>> 0;
		let t = U().subarray(i + o, i + r), a = X.encodeInto(e, t);
		o += a.written, i = n(i, r, o, 1) >>> 0;
	}
	return Z = o, i;
}
function q(e) {
	let t = Q.__wbindgen_externrefs.get(e);
	return Q.__externref_table_dealloc(e), t;
}
var J = new TextDecoder("utf-8", {
	ignoreBOM: !0,
	fatal: !0
});
J.decode();
var wt = 2146435072, Y = 0;
function Tt(e, t) {
	return Y += t, Y >= wt && (J = new TextDecoder("utf-8", {
		ignoreBOM: !0,
		fatal: !0
	}), J.decode(), Y = t), J.decode(U().subarray(e, e + t));
}
var X = new TextEncoder();
"encodeInto" in X || (X.encodeInto = function(e, t) {
	let n = X.encode(e);
	return t.set(n), {
		read: e.length,
		written: n.length
	};
});
var Z = 0, Q;
function Et(e, t) {
	return Q = e.exports, B = null, H = null, Q.__wbindgen_start(), Q;
}
async function Dt(e, t) {
	if (typeof Response == "function" && e instanceof Response) {
		if (typeof WebAssembly.instantiateStreaming == "function") try {
			return await WebAssembly.instantiateStreaming(e, t);
		} catch (t) {
			if (e.ok && n(e.type) && e.headers.get("Content-Type") !== "application/wasm") console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", t);
			else throw t;
		}
		let r = await e.arrayBuffer();
		return await WebAssembly.instantiate(r, t);
	} else {
		let n = await WebAssembly.instantiate(e, t);
		return n instanceof WebAssembly.Instance ? {
			instance: n,
			module: e
		} : n;
	}
	function n(e) {
		switch (e) {
			case "basic":
			case "cors":
			case "default": return !0;
		}
		return !1;
	}
}
function Ot(e) {
	if (Q !== void 0) return Q;
	e !== void 0 && (Object.getPrototypeOf(e) === Object.prototype ? {module: e} = e : console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));
	let t = xt();
	return e instanceof WebAssembly.Module || (e = new WebAssembly.Module(e)), Et(new WebAssembly.Instance(e, t), e);
}
async function kt(e) {
	if (Q !== void 0) return Q;
	e !== void 0 && (Object.getPrototypeOf(e) === Object.prototype ? {module_or_path: e} = e : console.warn("using deprecated parameters for the initialization function; pass a single object instead"));
	let t = xt();
	(typeof e == "string" || typeof Request == "function" && e instanceof Request || typeof URL == "function" && e instanceof URL) && (e = fetch(e));
	let { instance: n, module: r } = await Dt(await e, t);
	return Et(n, r);
}
async function At(e) {
	return Q = void 0, B = null, H = null, kt(e);
}
//#endregion
//#region packages/xlsx/src/internal/node-acquisition.ts
var jt, Mt;
function Nt(e) {
	if (!Mt) jt = e, Mt = new Ce(_t, e);
	else if (jt !== e) throw Error("XLSX runtime was already initialized with another WebAssembly.Module");
	return Mt;
}
async function Pt(e, t, r = {}) {
	let i = n(r), o = new u({
		enabled: i.debug || i.onResourceMetrics !== void 0,
		format: "xlsx",
		mode: "node",
		scope: "session",
		policy: i.policy,
		onMetrics: i.onResourceMetrics,
		emitToConsole: i.debug
	});
	o.setSourceBytes(e.byteLength);
	let s;
	try {
		It(r.signal);
		let [n, c, l] = a(i.policy), u = R;
		s = await Nt(t).open(() => new u(e, n, c, l), {
			signal: r.signal,
			abortError: Lt,
			disposeOnAbort: (e) => e.free()
		}), It(r.signal);
		let d = s.proxy, ee = JSON.parse(new TextDecoder().decode(d.parse())), f = Ft(d.resource_usage());
		return o.observeUsage(f), o.checkpoint("workbook index ready"), {
			archive: d,
			workbookIndex: ee,
			usage: f,
			metrics: o,
			closeArchive: () => s?.close((e) => e.free())
		};
	} catch (e) {
		try {
			s?.close((e) => e.free());
		} catch {}
		let t = f(e) ?? e;
		throw o.fail(t), t;
	}
}
function Ft(e) {
	try {
		return g(e);
	} catch (e) {
		if (String(e).includes("worksheet cursor usage is unavailable")) return;
		throw e;
	}
}
function It(e) {
	if (e?.aborted) throw Lt();
}
function Lt() {
	let e = /* @__PURE__ */ Error("XLSX workbook session was aborted");
	return e.name = "AbortError", e;
}
//#endregion
//#region packages/node/src/xlsx.ts
var Rt = y(() => Ie(import.meta.url, "xlsx_parser_bg.wasm", "@silurus/ooxml-xlsx/wasm-binary"));
async function $(e, t = {}) {
	let n = await Pt(Kt(e), Rt(), t);
	return new zt(n.closeArchive, n.archive, n.workbookIndex, n.metrics, n.usage, t.signal);
}
var zt = class {
	workbookIndex;
	sheetCount;
	sheetNames;
	pull;
	transport;
	worksheetPullClient;
	active;
	closed = !1;
	closePromise;
	lastUsage;
	completedWorksheets = 0;
	rowBatches = 0;
	emittedRows = 0;
	constructor(e, t, n, r, i, a) {
		this.closeArchive = e, this.archive = t, this.metrics = r, this.signal = a, this.workbookIndex = Wt(n), this.sheetNames = Object.freeze(this.workbookIndex.workbook.sheets.map((e) => e.name)), this.sheetCount = this.sheetNames.length, this.lastUsage = i, this.pull = new ge(() => this.archive), this.transport = new v((e, t) => this.pull.dispatchSafely(e, t), () => void 0), this.worksheetPullClient = new ve({
			transport: this.transport,
			sharedStrings: n.sharedStrings,
			open: async (e, t, n) => {
				this.pull.reserveOpen(n), await this.pull.open(e, t, n);
			},
			onUsage: (e) => {
				this.lastUsage = e, this.metrics.observeUsage(e);
			}
		});
	}
	get resourceUsage() {
		if (this.closed) return this.lastUsage;
		try {
			this.lastUsage = Gt(this.archive.resource_usage());
		} catch {}
		return this.lastUsage;
	}
	async *worksheetRows(e) {
		if (this.closed) throw Error("XLSX workbook session is closed");
		if (this.active) throw Error("another XLSX worksheet row stream is already active");
		if (!Number.isSafeInteger(e) || e < 0) throw RangeError("sheetIndex must be a non-negative safe integer");
		let t = this.requireSheetName(e), n = {};
		this.active = n;
		let r;
		try {
			for await (let n of this.worksheetPullClient.stream(e, t, this.signal)) {
				if (this.closed) throw Error("XLSX workbook session is closed");
				if (n.kind === "rows") {
					this.rowBatches += 1, this.emittedRows += n.rows.length, yield {
						kind: "rows",
						rows: n.rows,
						sequence: n.sequence,
						wireBytes: n.wireBytes,
						usage: n.usage
					};
					continue;
				}
				yield {
					kind: "finished",
					worksheet: n.worksheet,
					sequence: n.sequence,
					wireBytes: n.wireBytes,
					usage: n.usage
				};
			}
			this.completedWorksheets += 1, this.metrics.checkpoint("worksheet stream complete", this.lastUsage);
		} catch (e) {
			throw r = f(e) ?? e, this.metrics.fail(r), await this.close().catch(() => void 0), r;
		} finally {
			try {
				await this.cleanupOperation(n, r === void 0 ? "closed" : "request-error");
			} catch (e) {
				if (r === void 0) {
					let t = f(e) ?? e;
					throw this.metrics.fail(t), await this.close().catch(() => void 0), t;
				}
			}
		}
	}
	close() {
		return this.closePromise ? this.closePromise : (this.closed = !0, this.closePromise = this.release(), this.closePromise);
	}
	cleanupOperation(e, t) {
		return e.cleanupPromise ||= (async () => {
			let n;
			try {
				await this.worksheetPullClient.cancelAll(t);
			} catch (e) {
				n = f(e) ?? e;
			}
			try {
				await this.pull.reset();
			} catch (e) {
				n ??= f(e) ?? e;
			}
			if (this.active === e && (this.active = void 0), n !== void 0) throw n;
		})(), e.cleanupPromise;
	}
	async release() {
		let e;
		if (this.active) try {
			await this.cleanupOperation(this.active, "closed");
		} catch (t) {
			e = f(t) ?? t;
		}
		this.transport.terminate();
		try {
			this.closeArchive();
		} catch (t) {
			e ??= f(t) ?? t;
		}
		if (e !== void 0) throw this.metrics.fail(e), e;
		this.metrics.checkpoint("workbook session closed", this.lastUsage), this.metrics.succeed({
			worksheets: this.completedWorksheets,
			"row-batches": this.rowBatches,
			rows: this.emittedRows
		});
	}
	requireSheetName(e) {
		let t = this.workbookIndex.workbook.sheets[e];
		if (!t) throw RangeError(`Sheet index ${e} out of range`);
		return t.name;
	}
};
async function Bt(e, t = {}) {
	return _(() => $(e, t), async (e) => structuredClone(e.workbookIndex));
}
async function Vt(e, t, n = {}) {
	return _(() => $(e, n), async (e) => (await Ut(e, t)).worksheet);
}
async function Ht(e, t = {}) {
	return _(() => $(e, t), async (e) => {
		let t = [], n = {
			rows: 0,
			cells: 0,
			ownedUtf8Bytes: 0,
			jsonBytes: 0
		};
		for (let r = 0; r < e.sheetCount; r += 1) {
			let i = await Ut(e, r), a = de(n, i.usage);
			_e(a, "materialize-workbook", void 0, i.resourceUsage), n = a, t.push(i.worksheet);
		}
		return {
			workbookIndex: structuredClone(e.workbookIndex),
			worksheets: Object.freeze(t)
		};
	});
}
async function Ut(e, t) {
	let n = [], r = {
		rows: 0,
		cells: 0,
		ownedUtf8Bytes: 0
	}, i, a, o;
	for await (let s of e.worksheetRows(t)) if (o = s.usage ?? o, s.kind === "rows") {
		let e = he(r, pe(s.rows));
		me(e, "materialize-worksheet", void 0, o), n.push(...s.rows), r = e;
	} else {
		a = s.worksheet, a.rows = a.parseError ? [] : n;
		let e = ye(a, a.parseError ? {
			rows: 0,
			cells: 0,
			ownedUtf8Bytes: 0
		} : r);
		me(e, "materialize-worksheet", void 0, o), fe(e.jsonBytes, "materialize-worksheet", void 0, o), r = e, i = e;
	}
	if (!a || !i) throw Error(`XLSX worksheet ${t} did not produce a terminal model`);
	return {
		worksheet: a,
		usage: i,
		resourceUsage: o
	};
}
function Wt(e, t = /* @__PURE__ */ new WeakSet()) {
	if (typeof e != "object" || !e) return e;
	let n = e;
	if (t.has(n)) return e;
	t.add(n);
	for (let e of Object.values(n)) Wt(e, t);
	return Object.freeze(e);
}
function Gt(e) {
	try {
		return g(e);
	} catch (e) {
		if (String(e).includes("worksheet cursor usage is unavailable")) return;
		throw e;
	}
}
function Kt(e) {
	return e instanceof Uint8Array ? e : new Uint8Array(e);
}
//#endregion
export { s as OoxmlDecodedImageLimitError, p as OoxmlResourceLimitError, De as installImageBitmapShim, Te as installOffscreenCanvasShim, c as isOoxmlDecodedImageLimitError, pt as materializeDocxDocument, Ve as materializePptxPresentation, Ht as materializeXlsxWorkbook, Bt as materializeXlsxWorkbookIndex, Vt as materializeXlsxWorksheet, ft as openDocxDocument, Re as openPptxPresentation, $ as openXlsxWorkbook, Ee as renderSlideNode };
