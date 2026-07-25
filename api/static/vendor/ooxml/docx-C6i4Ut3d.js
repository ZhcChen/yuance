import { t as e } from "./chunk-DmhlhrBa.js";
import { B as t, Bt as n, Ct as r, D as i, E as a, Ft as o, G as s, Gt as c, H as l, Ht as u, I as d, It as f, J as p, Jt as m, K as h, Kt as g, L as _, Lt as v, M as y, Mt as b, N as x, Nt as S, O as C, P as w, Pt as T, R as E, Rt as D, S as O, St as k, T as A, U as j, Ut as M, V as N, Vt as P, W as ee, Wt as F, X as I, Y as L, Yt as te, _ as ne, _t as re, a as ie, at as ae, b as oe, bt as se, d as ce, et as le, f as ue, ft as de, g as fe, h as pe, i as me, it as he, k as ge, l as _e, lt as ve, m as ye, mt as be, n as xe, nt as Se, o as R, ot as Ce, p as we, pt as Te, q as Ee, qt as z, r as De, rt as Oe, t as ke, tt as Ae, u as je, ut as Me, v as Ne, vt as Pe, w as Fe, x as B, y as Ie, yt as V, z as Le, zt as Re } from "./find-cursor-CaGrVs7z.js";
import { a as ze, c as Be, d as Ve, f as He, i as Ue, l as We, n as Ge, o as Ke, p as qe, r as Je, s as Ye, t as Xe, u as Ze } from "./highlight-rect-DZn1OD1x.js";
import { t as Qe } from "./mathjax-BPjQ2C_j.js";
//#region packages/core/src/fonts/embedded.ts
function $e(e, t) {
	let n = et(t), r = e.slice(), i = Math.min(32, r.length);
	for (let e = 0; e < i; e++) r[e] ^= n[e % 16];
	return r;
}
function et(e) {
	let t = e.replace(/[{}\-\s]/g, "");
	if (t.length !== 32 || /[^0-9a-fA-F]/.test(t)) throw Error(`invalid fontKey GUID: ${e}`);
	let n = new Uint8Array(16);
	for (let e = 0; e < 16; e++) n[e] = parseInt(t.slice(e * 2, e * 2 + 2), 16);
	return n.reverse();
}
function tt(e, t, n, r) {
	let i = 2166136261;
	for (let e = 0; e < r.length; e++) i ^= r[e], i = Math.imul(i, 16777619);
	return `${e}|${t}|${n}|${r.length}|${(i >>> 0).toString(16)}`;
}
async function nt(e, t = 30 * 1024 * 1024) {
	let n = P();
	if (!n || typeof FontFace > "u") return [];
	let r = [], i = [], a = [];
	for (let o of e) try {
		if (o.bytes.length === 0 || o.bytes.length > t) {
			a.push(o.family);
			continue;
		}
		let e = o.odttf ? $e(o.bytes, o.fontKey ?? "") : o.bytes, { face: s, isNew: c } = g(`embedded:${tt(o.family, o.weight, o.style, e)}`, n, () => {
			let t = e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength), r = new FontFace(o.family, t, {
				weight: o.weight,
				style: o.style
			});
			return n.add(r), r;
		});
		r.push(s), c && i.push(s);
	} catch {
		a.push(o.family);
	}
	return i.length > 0 && await F(Promise.allSettled(i.map((e) => e.load())).then((e) => (e.forEach((e, t) => {
		e.status === "rejected" && a.push(i[t].family);
	}), n.ready))), a.length > 0 && console.warn(`[ooxml] failed to register embedded font(s): ${[...new Set(a)].join(", ")}; falling back to substitute fonts (text may shift or differ).`), r;
}
function rt(e) {
	c(e);
}
//#endregion
//#region packages/core/src/fonts/canvas-route.ts
function it(e, t) {
	let n = e.trim();
	if (!n) throw TypeError("Canvas font route requires a family list");
	return Object.freeze({
		familyList: n,
		scope: t,
		fingerprint: `canvas-font-route-v1:${encodeURIComponent(t)}:${encodeURIComponent(n)}`
	});
}
function at(e, t, n, r) {
	if (!Number.isFinite(t) || t < 0) throw RangeError("Canvas font size must be finite and non-negative");
	if (!Number.isFinite(n) || n < 1 || n > 1e3) throw RangeError("Canvas font weight must be finite and between 1 and 1000");
	if (!e.familyList.trim()) throw TypeError("Canvas font route requires a family list");
	return `${r} ${n} ${t}px ${e.familyList}`;
}
//#endregion
//#region packages/core/src/shape/drawingml-shape.ts
var ot = new Set([
	"line",
	"straightconnector1",
	"bentconnector2",
	"bentconnector3",
	"bentconnector4",
	"bentconnector5",
	"curvedconnector2",
	"curvedconnector3",
	"curvedconnector4",
	"curvedconnector5"
]), st = new Set([
	"callout1",
	"callout2",
	"callout3",
	"bordercallout1",
	"bordercallout2",
	"bordercallout3",
	"accentcallout1",
	"accentcallout2",
	"accentcallout3",
	"accentbordercallout1",
	"accentbordercallout2",
	"accentbordercallout3"
]);
function ct(e) {
	return st.has(e) || e === "line" || e === "straightconnector1" || e.startsWith("bentconnector");
}
function lt(e, t, n, r) {
	let i = t.stroke;
	if (!i || !ot.has(n) && !st.has(n)) return;
	let { x: a, y: o, w: s, h: c } = t.rect, l = de(n, a, o, s, c, [...t.geometry.kind === "preset" ? t.geometry.adjustments : []]);
	if (l) {
		if (ct(n) && l.vertices.length >= 2 && (i.headEnd || i.tailEnd)) {
			let t = l.vertices.map((e) => ({
				x: e.x,
				y: e.y
			}));
			i.tailEnd && (t[t.length - 1] = Ye(t[t.length - 1], t[t.length - 2], Ke(i.tailEnd, i, r))), i.headEnd && (t[0] = Ye(t[0], t[1], Ke(i.headEnd, i, r))), V(e, i, r), e.beginPath(), e.moveTo(t[0].x, t[0].y);
			for (let n = 1; n < t.length; n++) e.lineTo(t[n].x, t[n].y);
			e.stroke();
		}
		i.tailEnd && ze(e, l.end.x, l.end.y, l.end.angle, i.tailEnd, i, r), i.headEnd && ze(e, l.start.x, l.start.y, l.start.angle, i.headEnd, i, r);
	}
}
function ut(e, t, n) {
	if (t.geometry.kind !== "custom") return;
	let r = t.stroke;
	if (!r || !r.headEnd && !r.tailEnd) return;
	let i = We(t.geometry.subpaths), { x: a, y: o, w: s, h: c } = t.rect;
	i.start && r.headEnd && ze(e, a + i.start.x * s, o + i.start.y * c, Math.atan2(i.start.dy * c, i.start.dx * s), r.headEnd, r, n), i.end && r.tailEnd && ze(e, a + i.end.x * s, o + i.end.y * c, Math.atan2(i.end.dy * c, i.end.dx * s), r.tailEnd, r, n);
}
function dt(e, t, n) {
	let { x: r, y: i, w: a, h: o } = t.rect, { rotationDeg: s, flipH: c, flipV: l } = t.transform;
	e.save();
	try {
		(s !== 0 || c || l) && (e.translate(r + a / 2, i + o / 2), s !== 0 && e.rotate(s * Math.PI / 180), e.scale(c ? -1 : 1, l ? -1 : 1), e.translate(-(r + a / 2), -(i + o / 2)));
		let u = k(t.fill, e, r, i, a, o), d = t.stroke, f = d ? () => {
			V(e, d, n), e.stroke();
		} : null;
		if (t.geometry.kind === "preset") {
			let s = t.geometry.name.toLowerCase(), c = [...t.geometry.adjustments], l = ct(s) && !!(d?.headEnd || d?.tailEnd);
			Te(s) && be(e, s, r, i, a, o, c, u, f, () => {}, l ? { skipTrailingStroke: !0 } : void 0) || (e.beginPath(), Be(e, s, r, i, a, o, c[0], c[1], c[2], c[3]), u && s !== "arc" && (e.fillStyle = u, s === "donut" || s === "smileyface" || s === "frame" ? e.fill("evenodd") : e.fill()), f && f()), lt(e, t, s, n);
		} else e.beginPath(), Ze(e, t.geometry.subpaths, r, i, a, o), u && (e.fillStyle = u, e.fill()), f && f(), ut(e, t, n);
	} finally {
		e.restore();
	}
}
//#endregion
//#region packages/core/src/draw/double-border.ts
function ft(e, t) {
	let n = Math.max(1, Math.round(e * t / 3)), r = Math.max(1, Math.round(e * t / 3));
	return {
		railDev: n,
		gapDev: r,
		spanDev: 2 * n + r
	};
}
//#endregion
//#region packages/core/src/text/number-format.ts
var pt = [
	[1e3, "M"],
	[900, "CM"],
	[500, "D"],
	[400, "CD"],
	[100, "C"],
	[90, "XC"],
	[50, "L"],
	[40, "XL"],
	[10, "X"],
	[9, "IX"],
	[5, "V"],
	[4, "IV"],
	[1, "I"]
];
function mt(e) {
	let t = "", n = e;
	for (let [e, r] of pt) for (; n >= e;) t += r, n -= e;
	return t;
}
function ht(e, t) {
	let n = t.length, r = Math.floor((e - 1) / n) + 1;
	return t[(e - 1) % n].repeat(r);
}
var gt = Array.from({ length: 26 }, (e, t) => String.fromCharCode(65 + t)), _t = /* @__PURE__ */ "أ.ب.ت.ث.ج.ح.خ.د.ذ.ر.ز.س.ش.ص.ض.ط.ظ.ع.غ.ف.ق.ك.ل.م.ن.ه.و.ي".split("."), vt = /* @__PURE__ */ "أ.ب.ج.د.ه.و.ز.ح.ط.ي.ك.ل.م.ن.س.ع.ف.ص.ق.ر.ش.ت.ث.خ.ذ.ض.غ.ظ".split("."), yt = [
	"א",
	"ב",
	"ג",
	"ד",
	"ה",
	"ו",
	"ז",
	"ח",
	"ט",
	"י",
	"כ",
	"ל",
	"מ",
	"נ",
	"ס",
	"ע",
	"פ",
	"צ",
	"ק",
	"ר",
	"ש",
	"ת"
], bt = [
	...Dt(1072, 1080),
	...Dt(1082, 1087),
	...Dt(1088, 1097),
	"ы",
	"э",
	"ю",
	"я"
], xt = [
	...Dt(1040, 1048),
	...Dt(1050, 1055),
	...Dt(1056, 1065),
	"Ы",
	"Э",
	"Ю",
	"Я"
], St = [
	"ก",
	"ข",
	"ค",
	...Dt(3591, 3619),
	"ล",
	...Dt(3623, 3630)
], Ct = [
	"ㄱ",
	"ㄴ",
	"ㄷ",
	"ㄹ",
	"ㅁ",
	"ㅂ",
	"ㅅ",
	"ㅇ",
	"ㅈ",
	"ㅊ",
	"ㅋ",
	"ㅌ",
	"ㅍ",
	"ㅎ"
], wt = [
	"가",
	"나",
	"다",
	"라",
	"마",
	"바",
	"사",
	"아",
	"자",
	"차",
	"카",
	"타",
	"파",
	"하"
], Tt = Dt(2325, 2361), Et = [
	...Dt(2309, 2324),
	"अं",
	"अः"
];
function Dt(e, t) {
	let n = [];
	for (let r = e; r <= t; r++) n.push(String.fromCodePoint(r));
	return n;
}
var Ot = /* @__PURE__ */ "ア.イ.ウ.エ.オ.カ.キ.ク.ケ.コ.サ.シ.ス.セ.ソ.タ.チ.ツ.テ.ト.ナ.ニ.ヌ.ネ.ノ.ハ.ヒ.フ.ヘ.ホ.マ.ミ.ム.メ.モ.ヤ.ユ.ヨ.ラ.リ.ル.レ.ロ.ワ.ヰ.ヱ.ヲ.ン".split("."), kt = [
	...Dt(65393, 65436),
	"ｦ",
	"ﾝ"
];
function At(e) {
	return e <= 20 ? String.fromCodePoint(9312 + (e - 1)) : String(e);
}
function jt(e, t) {
	return String(e).split("").map((e) => t[e.charCodeAt(0) - 48]).join("");
}
var Mt = Dt(65296, 65305), Nt = Dt(3664, 3673), Pt = Dt(2406, 2415), Ft = [
	"〇",
	"一",
	"二",
	"三",
	"四",
	"五",
	"六",
	"七",
	"八",
	"九"
], It = [
	"영",
	"일",
	"이",
	"삼",
	"사",
	"오",
	"육",
	"칠",
	"팔",
	"구"
], Lt = [
	"零",
	"一",
	"二",
	"三",
	"四",
	"五",
	"六",
	"七",
	"八",
	"九"
], Rt = [
	"○",
	"一",
	"二",
	"三",
	"四",
	"五",
	"六",
	"七",
	"八",
	"九"
];
function zt(e, t) {
	if (e < 10) return t[e];
	if (e < 100) {
		let n = Math.floor(e / 10), r = e % 10, i = n === 1 ? "十" : t[n] + "十";
		return r === 0 ? i : i + t[r];
	}
	return jt(e, t);
}
function Bt(e, t) {
	switch (t) {
		case "upperRoman": return e >= 1 ? mt(e) : String(e);
		case "lowerRoman": return e >= 1 ? mt(e).toLowerCase() : String(e);
		case "upperLetter": return e >= 1 ? ht(e, gt) : String(e);
		case "lowerLetter": return e >= 1 ? ht(e, gt).toLowerCase() : String(e);
		case "arabicAlpha": return e >= 1 ? ht(e, _t) : String(e);
		case "arabicAbjad": return e >= 1 ? ht(e, vt) : String(e);
		case "russianLower": return e >= 1 ? ht(e, bt) : String(e);
		case "russianUpper": return e >= 1 ? ht(e, xt) : String(e);
		case "thaiLetters": return e >= 1 ? ht(e, St) : String(e);
		case "chosung": return e >= 1 ? ht(e, Ct) : String(e);
		case "ganada": return e >= 1 ? ht(e, wt) : String(e);
		case "hindiVowels": return e >= 1 ? ht(e, Tt) : String(e);
		case "hindiConsonants": return e >= 1 ? ht(e, Et) : String(e);
		case "aiueoFullWidth": return e >= 1 ? ht(e, Ot) : String(e);
		case "aiueo": return e >= 1 ? ht(e, kt) : String(e);
		case "decimalEnclosedCircle": return e >= 1 ? At(e) : String(e);
		case "hebrew1": return e >= 1 ? Wt(e) : String(e);
		case "hebrew2": return e >= 1 ? Gt(e) : String(e);
		case "hex": return e >= 1 ? e.toString(16).toUpperCase() : String(e);
		case "numberInDash": return e >= 1 ? `- ${e} -` : String(e);
		case "decimalZero": return e >= 1 && e <= 9 ? `0${e}` : String(e);
		case "decimalFullWidth": return e >= 1 ? jt(e, Mt) : String(e);
		case "decimalHalfWidth": return String(e);
		case "thaiNumbers": return e >= 1 ? jt(e, Nt) : String(e);
		case "hindiNumbers": return e >= 1 ? jt(e, Pt) : String(e);
		case "ideographDigital":
		case "japaneseDigitalTenThousand": return e >= 1 ? jt(e, Ft) : String(e);
		case "koreanDigital": return e >= 1 ? jt(e, It) : String(e);
		case "koreanDigital2": return e >= 1 ? jt(e, Lt) : String(e);
		case "taiwaneseDigital": return e >= 1 ? jt(e, Rt) : String(e);
		case "chineseCounting": return e >= 1 ? zt(e, Ft) : String(e);
		case "taiwaneseCounting": return e >= 1 ? zt(e, Rt) : String(e);
		case "chineseCountingThousand": return e >= 1 ? en(e, qt) : String(e);
		case "taiwaneseCountingThousand": return e >= 1 ? en(e, Jt) : String(e);
		case "chineseLegalSimplified": return e >= 1 ? en(e, Xt) : String(e);
		case "ideographLegalTraditional": return e >= 1 ? en(e, Qt) : String(e);
		case "japaneseCounting": return e >= 1 ? en(e, Kt) : String(e);
		case "japaneseLegal": return e >= 1 ? en(e, Zt) : String(e);
		case "koreanCounting": return e >= 1 ? en(e, Yt) : String(e);
		case "koreanLegal": return e >= 1 ? rn(e) : String(e);
		default: return String(e);
	}
}
var Vt = [
	"",
	"א",
	"ב",
	"ג",
	"ד",
	"ה",
	"ו",
	"ז",
	"ח",
	"ט"
], Ht = [
	"",
	"י",
	"כ",
	"ל",
	"מ",
	"נ",
	"ס",
	"ע",
	"פ",
	"צ"
], Ut = [
	"",
	"ק",
	"ר",
	"ש",
	"ת",
	"ך",
	"ם",
	"ן",
	"ף",
	"ץ"
];
function Wt(e) {
	let t = "", n = e, r = Math.floor(n / 1e3);
	n %= 1e3;
	let i = Math.floor(n / 100);
	if (n %= 100, r > 0 && (t += Vt[r % 10]), t += Ut[i], n === 15) return t + "טו";
	if (n === 16) return t + "טז";
	let a = Math.floor(n / 10), o = n % 10;
	return t += Ht[a], t += Vt[o], t;
}
function Gt(e) {
	let t = yt.length, n = Math.floor((e - 1) / t);
	return yt[e - t * n - 1] + "ת".repeat(n);
}
var Kt = {
	digits: Lt,
	ten: "十",
	hundred: "百",
	thousand: "千",
	myriad: "万",
	elideOne: !0,
	insertZero: !1
}, qt = {
	...Kt,
	elideOne: !1,
	insertZero: !0
}, Jt = { ...qt }, Yt = {
	digits: [
		"영",
		"일",
		"이",
		"삼",
		"사",
		"오",
		"육",
		"칠",
		"팔",
		"구"
	],
	ten: "십",
	hundred: "백",
	thousand: "천",
	myriad: "만",
	elideOne: !0,
	insertZero: !1
}, Xt = {
	digits: [
		"零",
		"壹",
		"贰",
		"叁",
		"肆",
		"伍",
		"陆",
		"柒",
		"捌",
		"玖"
	],
	ten: "拾",
	hundred: "佰",
	thousand: "仟",
	myriad: "万",
	elideOne: !1,
	insertZero: !0
}, Zt = {
	digits: [
		"零",
		"壱",
		"弐",
		"参",
		"四",
		"伍",
		"六",
		"七",
		"八",
		"九"
	],
	ten: "拾",
	hundred: "百",
	thousand: "阡",
	myriad: "萬",
	elideOne: !1,
	insertZero: !1
}, Qt = {
	digits: [
		"零",
		"壹",
		"貳",
		"參",
		"肆",
		"伍",
		"陸",
		"柒",
		"捌",
		"玖"
	],
	ten: "拾",
	hundred: "佰",
	thousand: "仟",
	myriad: "萬",
	elideOne: !1,
	insertZero: !1
};
function $t(e, t, n) {
	let r = Math.floor(e / 1e3) % 10, i = Math.floor(e / 100) % 10, a = Math.floor(e / 10) % 10, o = e % 10, s = [
		{
			digit: r,
			unit: t.thousand
		},
		{
			digit: i,
			unit: t.hundred
		},
		{
			digit: a,
			unit: t.ten
		},
		{
			digit: o,
			unit: ""
		}
	], c = "", l = !1, u = !1;
	for (let { digit: e, unit: r } of s) {
		if (e === 0) {
			l && (u = !0);
			continue;
		}
		u &&= (t.insertZero && (c += t.digits[0]), !1), n && e === 1 && r ? c += r : c += t.digits[e] + r, l = !0;
	}
	return c;
}
function en(e, t) {
	if (e >= 1e8) {
		let n = Math.floor(e / 1e8), r = e % 1e8, i = en(n, t) + "億";
		return r === 0 ? i : i + (t.insertZero && r < 1e7 ? t.digits[0] : "") + en(r, t);
	}
	let n = Math.floor(e / 1e4), r = e % 1e4, i = "";
	return n > 0 && (i += $t(n, t, t.elideOne) + t.myriad), r > 0 && (t.insertZero && n > 0 && r < 1e3 && (i += t.digits[0]), i += $t(r, t, t.elideOne)), i;
}
var tn = [
	"",
	"하나",
	"둘",
	"셋",
	"넷",
	"다섯",
	"여섯",
	"일곱",
	"여덟",
	"아홉"
], nn = [
	"",
	"열",
	"스물",
	"서른",
	"마흔",
	"쉰",
	"예순",
	"일흔",
	"여든",
	"아흔"
];
function rn(e) {
	if (e >= 100) return String(e);
	let t = Math.floor(e / 10), n = e % 10;
	return nn[t] + tn[n];
}
//#endregion
//#region packages/core/src/text/field-format-switch.ts
var an = {
	Arabic: "decimal",
	ArabicDash: "numberInDash",
	Hex: "hex",
	Roman: "upperRoman",
	roman: "lowerRoman",
	ALPHABETIC: "upperLetter",
	alphabetic: "lowerLetter",
	ARABICABJAD: "arabicAbjad",
	ARABICALPHA: "arabicAlpha",
	HEBREW1: "hebrew1",
	HEBREW2: "hebrew2",
	HINDIARABIC: "hindiNumbers",
	HINDILETTER1: "hindiVowels",
	HINDILETTER2: "hindiConsonants",
	THAIARABIC: "thaiNumbers",
	THAILETTER: "thaiLetters",
	CHOSUNG: "chosung",
	GANADA: "ganada",
	DBCHAR: "decimalFullWidth",
	SBCHAR: "decimalHalfWidth"
};
function on(e) {
	let t = /\\\*\s+(\S+)/g, n;
	for (; (n = t.exec(e)) !== null;) {
		let e = an[n[1]];
		if (e) return e;
	}
	return null;
}
//#endregion
//#region packages/core/src/text/date-time-picture.ts
var sn = [
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
], cn = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
], ln = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday"
], un = [
	"Sun",
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat"
], dn = (e) => e < 10 ? `0${e}` : `${e}`;
function fn(e) {
	let t = /\\@\s*"([^"]*)"/.exec(e);
	if (t) return t[1];
	let n = /\\@\s*(\S+)/.exec(e);
	return n ? n[1] : null;
}
function pn(e, t) {
	let n = t.getFullYear(), r = t.getMonth(), i = t.getDate(), a = t.getDay(), o = t.getHours(), s = o % 12 == 0 ? 12 : o % 12, c = t.getMinutes(), l = t.getSeconds(), u = o >= 12, d = "", f = 0, p = e.length;
	for (; f < p;) {
		let t = e[f];
		if (t === "'") {
			f++;
			let t = "";
			for (; f < p;) {
				if (e[f] === "'") {
					if (e[f + 1] === "'") {
						t += "'", f += 2;
						continue;
					}
					f++;
					break;
				}
				t += e[f++];
			}
			d += t;
			continue;
		}
		if (/[A-Za-z]/.test(t)) {
			let u = f;
			for (; u < p && e[u] === t;) u++;
			let m = e.slice(f, u).length, h = t.toLowerCase(), g = null;
			if (t === "y" || t === "Y" ? g = m >= 4 ? String(n).padStart(4, "0") : dn(n % 100) : t === "M" ? g = m >= 4 ? sn[r] : m === 3 ? cn[r] : m === 2 ? dn(r + 1) : String(r + 1) : h === "d" ? g = m >= 4 ? ln[a] : m === 3 ? un[a] : m === 2 ? dn(i) : String(i) : t === "H" ? g = m >= 2 ? dn(o) : String(o) : t === "h" ? g = m >= 2 ? dn(s) : String(s) : t === "m" ? g = m >= 2 ? dn(c) : String(c) : t === "s" ? g = m >= 2 ? dn(l) : String(l) : (h === "a" || h === "p") && (g = null), g !== null) {
				d += g, f = u;
				continue;
			}
			if (!(h === "a" || h === "p")) return null;
		}
		let m = /^([AaPp])([Mm])?\/([AaPp])([Mm])?/.exec(e.slice(f));
		if (m) {
			let e = m[2] !== void 0;
			d += e ? u ? "PM" : "AM" : u ? "P" : "A", f += m[0].length;
			continue;
		}
		d += t, f++;
	}
	return d;
}
//#endregion
//#region packages/core/src/fonts/local-metrics.ts
function mn(e) {
	return e.trim().toLowerCase();
}
function hn(e) {
	return `local("${e.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}")`;
}
function gn(e) {
	return `__ooxml_local_${[...e].map((e) => (e.codePointAt(0) ?? 0).toString(16).padStart(6, "0")).join("")}`;
}
function _n() {
	return typeof OffscreenCanvas < "u" ? new OffscreenCanvas(1, 1).getContext("2d") : typeof document < "u" && document?.createElement ? document.createElement("canvas").getContext("2d") : null;
}
async function vn(e) {
	let t = P();
	if (!t || typeof FontFace > "u") return {
		faces: [],
		metrics: {}
	};
	let n = [], r = {}, i = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = t.family.trim(), n = t.localNames.map((e) => e.trim()).filter(Boolean);
		if (!e || n.length === 0 || t.lineHeightMultiplier != null && !(t.lineHeightMultiplier > 0)) continue;
		let r = t.weight ?? 400, a = t.style ?? "normal";
		if (!(r >= 100 && r <= 900) || a !== "normal" && a !== "italic") continue;
		let o = n.map(hn).join(", "), s = mn(e), c = `local-face:${o}:${r}:${a}`, l = i.get(c) ?? {
			source: o,
			requests: []
		};
		l.requests.push({
			...t,
			family: e,
			normalizedFamily: s,
			source: o,
			weight: r,
			style: a
		}), i.set(c, l);
	}
	for (let [e, a] of i) {
		let i = gn(e), { face: o } = g(e, t, () => {
			let e = a.requests[0], n = new FontFace(i, a.source, {
				weight: String(e.weight),
				style: e.style
			});
			return t.add(n), n;
		});
		try {
			if (!await F(o.load()) || o.status !== "loaded") throw Error("local font load timed out");
			let e = !1;
			for (let t of a.requests) {
				let n;
				if (t.lineHeightMultiplier != null) {
					let e = _n();
					if (!e) continue;
					e.font = `${t.style} ${t.weight} 100px "${i}"`;
					let r = e.measureText("Hg国"), a = r.fontBoundingBoxAscent, o = r.fontBoundingBoxDescent;
					if (!(Number.isFinite(a) && Number.isFinite(o) && a + o > 0)) continue;
					n = (a + o) / 100 * t.lineHeightMultiplier;
				}
				let a = t.weight === 400 && t.style === "normal" ? t.normalizedFamily : `${t.normalizedFamily}:${t.weight}:${t.style}`;
				r[a] = {
					family: i,
					...n == null ? {} : { lineHeightRatio: n },
					requestedFamily: t.family,
					weight: t.weight,
					style: t.style,
					sourceIdentity: t.source,
					synthesized: !1
				}, e = !0;
			}
			if (!e) throw Error("exact local font route unavailable");
			n.push(o);
		} catch {
			c([o]);
		}
	}
	return {
		faces: n,
		metrics: r
	};
}
function yn(e) {
	c(e);
}
//#endregion
//#region packages/core/src/text/font-advance-metrics.ts
var bn = [{
	test: (e) => e === "georgia",
	biasEm: .0105
}];
function xn(e) {
	return (e ?? "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ").toLowerCase();
}
function Sn(e) {
	let t = xn(e);
	for (let e of bn) if (e.test(t)) return e.biasEm;
	return 0;
}
//#endregion
//#region packages/docx/src/worker.ts?worker&inline
var Cn = "var e=class{__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,n.unregister(this),e}free(){let e=this.__destroy_into_raw();v.__wbg_docxarchive_free(e,0)}extract_image(e){let t=d(e,v.__wbindgen_malloc,v.__wbindgen_realloc),n=_,i=v.docxarchive_extract_image(this.__wbg_ptr,t,n);if(i[3])throw f(i[2]);var a=r(i[0],i[1]).slice();return v.__wbindgen_free(i[0],i[1]*1,1),a}constructor(e,t){let r=u(e,v.__wbindgen_malloc),i=_,a=v.docxarchive_new(r,i,!l(t),l(t)?BigInt(0):t);if(a[2])throw f(a[1]);return this.__wbg_ptr=a[0]>>>0,n.register(this,this.__wbg_ptr,this),this}parse(){let e=v.docxarchive_parse(this.__wbg_ptr);if(e[3])throw f(e[2]);var t=r(e[0],e[1]).slice();return v.__wbindgen_free(e[0],e[1]*1,1),t}to_markdown(){let e,t;try{let i=v.docxarchive_to_markdown(this.__wbg_ptr);var n=i[0],r=i[1];if(i[3])throw n=0,r=0,f(i[2]);return e=n,t=r,o(n,r)}finally{v.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(e.prototype[Symbol.dispose]=e.prototype.free);function t(){return{__proto__:null,\"./docx_parser_bg.js\":{__proto__:null,__wbg___wbindgen_throw_6b64449b9b9ed33c:function(e,t){throw Error(o(e,t))},__wbg_error_a6fa202b58aa1cd3:function(e,t){let n,r;try{n=e,r=t,console.error(o(e,t))}finally{v.__wbindgen_free(n,r,1)}},__wbg_new_227d7c05414eb861:function(){return Error()},__wbg_stack_3b0d974bbf31e44f:function(e,t){let n=t.stack,r=d(n,v.__wbindgen_malloc,v.__wbindgen_realloc),i=_;a().setInt32(e+4,i,!0),a().setInt32(e+0,r,!0)},__wbindgen_cast_0000000000000001:function(e,t){return o(e,t)},__wbindgen_init_externref_table:function(){let e=v.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}const n=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>v.__wbg_docxarchive_free(e>>>0,1));function r(e,t){return e>>>=0,c().subarray(e/1,e/1+t)}let i=null;function a(){return(i===null||i.buffer.detached===!0||i.buffer.detached===void 0&&i.buffer!==v.memory.buffer)&&(i=new DataView(v.memory.buffer)),i}function o(e,t){return e>>>=0,h(e,t)}let s=null;function c(){return(s===null||s.byteLength===0)&&(s=new Uint8Array(v.memory.buffer)),s}function l(e){return e==null}function u(e,t){let n=t(e.length*1,1)>>>0;return c().set(e,n/1),_=e.length,n}function d(e,t,n){if(n===void 0){let n=g.encode(e),r=t(n.length,1)>>>0;return c().subarray(r,r+n.length).set(n),_=n.length,r}let r=e.length,i=t(r,1)>>>0,a=c(),o=0;for(;o<r;o++){let t=e.charCodeAt(o);if(t>127)break;a[i+o]=t}if(o!==r){o!==0&&(e=e.slice(o)),i=n(i,r,r=o+e.length*3,1)>>>0;let t=c().subarray(i+o,i+r),a=g.encodeInto(e,t);o+=a.written,i=n(i,r,o,1)>>>0}return _=o,i}function f(e){let t=v.__wbindgen_externrefs.get(e);return v.__externref_table_dealloc(e),t}let p=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0});p.decode();let m=0;function h(e,t){return m+=t,m>=2146435072&&(p=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0}),p.decode(),m=t),p.decode(c().subarray(e,e+t))}const g=new TextEncoder;`encodeInto`in g||(g.encodeInto=function(e,t){let n=g.encode(e);return t.set(n),{read:e.length,written:n.length}});let _=0,v;function y(e,t){return v=e.exports,i=null,s=null,v.__wbindgen_start(),v}async function b(e,t){if(typeof Response==`function`&&e instanceof Response){if(typeof WebAssembly.instantiateStreaming==`function`)try{return await WebAssembly.instantiateStreaming(e,t)}catch(t){if(e.ok&&n(e.type)&&e.headers.get(`Content-Type`)!==`application/wasm`)console.warn(\"`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\\n\",t);else throw t}let r=await e.arrayBuffer();return await WebAssembly.instantiate(r,t)}else{let n=await WebAssembly.instantiate(e,t);return n instanceof WebAssembly.Instance?{instance:n,module:e}:n}function n(e){switch(e){case`basic`:case`cors`:case`default`:return!0}return!1}}async function x(e){if(v!==void 0)return v;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn(`using deprecated parameters for the initialization function; pass a single object instead`));let n=t();(typeof e==`string`||typeof Request==`function`&&e instanceof Request||typeof URL==`function`&&e instanceof URL)&&(e=fetch(e));let{instance:r,module:i}=await b(await e,n);return y(r,i)}async function S(e){return v=void 0,i=null,s=null,x(e)}function C(e){if(!e.startsWith(`data:`))return null;let t=e.indexOf(`,`);if(t===-1)return null;let n=atob(e.slice(t+1)),r=new Uint8Array(n.length);for(let e=0;e<n.length;e++)r[e]=n.charCodeAt(e);return r.buffer}var w=class e extends Error{code=`parser-crashed`;constructor(t){super(t),this.name=`WasmTrapError`,Object.setPrototypeOf(this,e.prototype)}};function T(e){let t=globalThis.WebAssembly?.RuntimeError;if(t&&e instanceof t||e instanceof RangeError)return!0;if(e instanceof Error){let t=e.name;if(t===`RuntimeError`||t===`CompileError`||t===`LinkError`)return!0}return!1}const E=new class{_init;_opts;_wasmInput=null;_initPromise=null;_poisoned=!1;_archive=null;constructor(e,t={}){this._init=e,this._opts=t}setWasmUrl(e){this._wasmInput=e,this._poisoned=!1,this._initPromise=this._init(e)}get archive(){return this._archive}setArchive(e){this._freeArchive(),this._archive=e}disposeArchive(){this._freeArchive()}_freeArchive(){this._archive!=null&&this._opts.freeArchive&&this._opts.freeArchive(this._archive),this._archive=null}get poisoned(){return this._poisoned}async ensureReady(){if(this._poisoned){if(this._wasmInput===null)throw Error(`WasmParserHost: setWasmUrl was never called`);let e=(this._opts.reinit??this._init)(this._wasmInput);this._initPromise=e,await e,this._poisoned=!1;return}if(this._initPromise===null)throw Error(`WasmParserHost: setWasmUrl was never called`);await this._initPromise}run(e){try{return e()}catch(e){throw T(e)?(this._poison(),new w(`WASM parser trapped and was recycled: ${e instanceof Error?e.message:String(e)}`)):e}}poison(){this._poison()}_poison(){if(this._poisoned=!0,this._initPromise=null,this._archive!=null&&this._opts.freeArchive)try{this._opts.freeArchive(this._archive)}catch{}this._archive=null}}(x,{freeArchive:e=>e.free(),reinit:S});self.onmessage=async t=>{let n=t.data;if(n.type===`init`){E.setWasmUrl(C(n.wasmUrl)??n.wasmUrl);return}let r=n.id;try{if(await E.ensureReady(),n.type===`parse`){let t=typeof n.maxZipEntryBytes==`number`&&n.maxZipEntryBytes>0?BigInt(n.maxZipEntryBytes):void 0,i=new Uint8Array(n.data),a=E.run(()=>{let n=new e(i,t);return E.setArchive(n),n.parse()}).buffer,o={type:`parsed`,id:r,documentJson:a};self.postMessage(o,[a]);return}let t=E.archive;if(n.type===`extractImage`){if(!t)throw Error(`No docx loaded`);let e=E.run(()=>t.extract_image(n.path).buffer),i={type:`imageExtracted`,id:r,bytes:e};self.postMessage(i,[e]);return}if(n.type===`toMarkdown`){if(!t)throw Error(`No docx loaded`);let e={type:`markdownRendered`,id:r,markdown:E.run(()=>t.to_markdown())};self.postMessage(e);return}}catch(e){let t={type:`error`,id:r,message:String(e)};self.postMessage(t)}};", wn = typeof self < "u" && self.Blob && new Blob(["URL.revokeObjectURL(import.meta.url);", Cn], { type: "text/javascript;charset=utf-8" });
function Tn(e) {
	let t;
	try {
		if (t = wn && (self.URL || self.webkitURL).createObjectURL(wn), !t) throw "";
		let n = new Worker(t, {
			type: "module",
			name: e?.name
		});
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(Cn), {
			type: "module",
			name: e?.name
		});
	}
}
//#endregion
//#region packages/docx/src/wasm/docx_parser_bg.wasm?url
var En = new URL("docx_parser_bg.wasm", import.meta.url).href;
//#endregion
//#region packages/docx/src/layout/fingerprint.ts
function Dn(e) {
	if (e === null || typeof e == "boolean" || typeof e == "number" || typeof e == "string") return JSON.stringify(e);
	if (Array.isArray(e)) return `[${e.map(Dn).join(",")}]`;
	if (typeof e == "object") {
		let t = e;
		return `{${Object.keys(t).sort().map((e) => `${JSON.stringify(e)}:${Dn(t[e])}`).join(",")}}`;
	}
	throw TypeError(`Cannot fingerprint ${typeof e}`);
}
function On(e, t) {
	let n = Dn(t);
	return `${e}:${encodeURIComponent(n)}`;
}
//#endregion
//#region packages/docx/src/layout/source-key.ts
function kn(e) {
	return `${e.story}:${encodeURIComponent(e.storyInstance)}:${e.path.join(".")}`;
}
function An(e, t, n) {
	if (t.length === 0 || n.length === 0) throw RangeError("Body occurrence identity requires a flow domain and fragment start");
	return [
		"body-occurrence",
		encodeURIComponent(kn(e)),
		encodeURIComponent(t),
		encodeURIComponent(n)
	].join("/");
}
function jn(e, t) {
	return `image:${kn(e)}:${encodeURIComponent(t)}`;
}
function Mn(e, t) {
	return `math:${kn(e)}:${encodeURIComponent(t)}`;
}
function Nn(e, t) {
	return `anchor:${kn(e)}:${encodeURIComponent(t)}`;
}
//#endregion
//#region packages/docx/src/layout/plain-data.ts
function Pn(e, t, n = /* @__PURE__ */ new WeakSet(), r = /* @__PURE__ */ new WeakSet()) {
	if (e == null || typeof e == "string" || typeof e == "boolean") return;
	if (typeof e == "number") {
		if (!Number.isFinite(e)) throw TypeError(`${t} must contain finite numbers`);
		return;
	}
	if (typeof e != "object" || n.has(e)) throw TypeError(`${t} must be structured-clone-safe plain data`);
	if (r.has(e)) return;
	let i = Object.getPrototypeOf(e);
	if (!Array.isArray(e) && i !== Object.prototype && i !== null) throw TypeError(`${t} must be structured-clone-safe plain data`);
	n.add(e);
	try {
		for (let [i, a] of Object.entries(e)) Pn(a, `${t}.${i}`, n, r);
	} finally {
		n.delete(e);
	}
	r.add(e);
}
function Fn(e, t = /* @__PURE__ */ new WeakSet()) {
	if (typeof e != "object" || !e || t.has(e)) return e;
	t.add(e);
	for (let n of Object.values(e)) Fn(n, t);
	return Object.freeze(e);
}
function H(e, t) {
	Pn(e, t);
	try {
		return Fn(structuredClone(e));
	} catch {
		throw TypeError(`${t} must be structured-clone-safe plain data`);
	}
}
//#endregion
//#region packages/docx/src/layout/typography-input.ts
function In(e) {
	let t = e.__typographyAcquisition;
	if (t !== void 0) return H({
		sourceText: "text" in e ? e.text : e.fallbackText,
		...t
	}, "DOCX run typography acquisition input");
}
function Ln(e) {
	let t = e.__paragraphTypographyAcquisition;
	if (t !== void 0) return H(t, "DOCX paragraph typography acquisition input");
}
//#endregion
//#region packages/docx/src/layout/textbox-input.ts
function Rn(e, t) {
	let n = e.fontFamily ?? null;
	return {
		fontSizePt: t,
		fonts: {
			ascii: n,
			highAnsi: n,
			eastAsia: e.fontFamilyEastAsia ?? n,
			complexScript: n
		},
		weight: 400,
		style: "normal",
		complexScript: !1
	};
}
function zn(e, t = {
	story: "textbox",
	storyInstance: "shape",
	path: []
}, n = Rn) {
	return H((e.textBlocks ?? []).map((e, r) => {
		let i = {
			story: "textbox",
			storyInstance: t.storyInstance,
			path: [...t.path, r]
		}, a = e.runs?.length ? e.runs : [{
			text: e.text,
			fontSizePt: e.fontSizePt,
			color: e.color,
			fontFamily: e.fontFamily,
			bold: e.bold,
			italic: e.italic
		}], o = e.color ?? a[0]?.color, s = e.numbering ? {
			...e.numbering,
			...e.numbering.color == null && !e.numbering.colorAuto && o ? { color: o } : {}
		} : null;
		return {
			source: i,
			spacing: {
				beforePt: e.spaceBefore ?? 0,
				afterPt: e.spaceAfter ?? 0
			},
			runs: a.map((t) => ({
				text: t.text,
				fontSizePt: t.fontSizePt,
				...t.color ?? e.color ? { color: `#${t.color ?? e.color}` } : {},
				...t.fontFamily || e.fontFamily ? { fontFamily: t.fontFamily ?? e.fontFamily ?? void 0 } : {},
				...t.fontFamilyEastAsia ? { fontFamilyEastAsia: t.fontFamilyEastAsia } : {},
				bold: t.bold ?? e.bold ?? !1,
				italic: t.italic ?? e.italic ?? !1,
				...t.ruby ? { ruby: t.ruby } : {}
			})),
			alignment: e.alignment ?? "left",
			indentLeftPt: e.indentLeft ?? 0,
			indentRightPt: e.indentRight ?? 0,
			indentFirstPt: e.indentFirst ?? 0,
			lineSpacing: e.lineSpacingVal == null ? null : {
				value: e.lineSpacingVal,
				rule: e.lineSpacingRule === "exact" || e.lineSpacingRule === "atLeast" ? e.lineSpacingRule : "auto",
				explicit: !0
			},
			tabStops: (e.tabStops ?? []).map((e) => ({ ...e })),
			...e.bidi === void 0 ? {} : { bidi: e.bidi },
			contextualSpacing: e.contextualSpacing ?? !1,
			...e.styleId === void 0 ? {} : { styleId: e.styleId },
			...s ? {
				numbering: s,
				numberingMarkerShapeInput: n(s, e.fontSizePt)
			} : {},
			...e.imagePath ? { image: {
				imagePath: e.imagePath,
				mimeType: e.mimeType ?? "application/octet-stream",
				...e.svgImagePath ? { svgImagePath: e.svgImagePath } : {},
				widthPt: e.imageWidthPt ?? 0,
				heightPt: e.imageHeightPt ?? 0
			} } : {}
		};
	}), "DOCX text box acquisition input");
}
//#endregion
//#region packages/docx/src/layout/exact-length.ts
function Bn(e, t) {
	let n = e < 0n ? -e : e, r = t < 0n ? -t : t;
	for (; r !== 0n;) [n, r] = [r, n % r];
	return n === 0n ? 1n : n;
}
function Vn(e, t) {
	if (t === 0n) throw RangeError("Exact length denominator must not be zero");
	let n = t < 0n ? -1n : 1n, r = Bn(e, t);
	return Object.freeze({
		numerator: n * e / r,
		denominator: n * t / r
	});
}
var Hn = 768, Un = 1100;
function Wn(e) {
	let t = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(e);
	if (!t) return null;
	let n = t[1] === "-", r = t[2] ?? "", i = t[3] ?? t[4] ?? "", a = Number(t[5] ?? "0");
	if (!Number.isSafeInteger(a)) return null;
	let o = `${r}${i}`, s = 0;
	for (; s < o.length && o.charCodeAt(s) === 48;) s += 1;
	if (s === o.length) return Vn(0n, 1n);
	let c = o.length - 1;
	for (; c > s && o.charCodeAt(c) === 48;) --c;
	let l = o.slice(s, c + 1), u = o.length - 1 - c, d = a - i.length + u, f = d + l.length - 1;
	if (l.length > Hn || Math.abs(f) > Un) return null;
	let p = BigInt(l), m = 1n;
	return d >= 0 ? p *= 10n ** BigInt(d) : m = 10n ** BigInt(-d), n && (p = -p), Vn(p, m);
}
function Gn(e) {
	let t = /^(-?\d+)\/([1-9]\d*)$/.exec(e);
	if (!t) throw RangeError(`Invalid exact length key: ${e}`);
	return Vn(BigInt(t[1]), BigInt(t[2]));
}
function Kn(e) {
	let t = Vn(e.numerator, e.denominator);
	return `${t.numerator}/${t.denominator}`;
}
function qn(e) {
	let t = Wn(e);
	return t ? Kn(t) : null;
}
function Jn(e) {
	if (!Number.isFinite(e) || e < 0) return null;
	let t = Wn(e.toString());
	return t ? Kn(t) : null;
}
function Yn(e, t) {
	let n = e.toString(2).length - t.toString(2).length;
	return (n >= 0 ? e < t << BigInt(n) : e << BigInt(-n) < t) && --n, n;
}
function Xn(e, t, n) {
	let r = n >= 0 ? e << BigInt(n) : e, i = n < 0 ? t << BigInt(-n) : t, a = r / i, o = r % i * 2n - i;
	return o > 0n || o === 0n && a % 2n != 0n ? a + 1n : a;
}
function Zn(e) {
	let t = Gn(e);
	if (t.numerator === 0n) return 0;
	let n = t.numerator < 0n, r = n ? -t.numerator : t.numerator, i = Yn(r, t.denominator), a;
	if (i < -1022) {
		let e = Xn(r, t.denominator, 1074);
		a = Number(e) * Number.MIN_VALUE;
	} else {
		let e = Xn(r, t.denominator, 52 - i);
		e === 1n << 53n && (e >>= 1n, i += 1), a = i > 1023 ? Infinity : Number(e) * 2 ** (i - 52);
	}
	return n ? -a : a;
}
function Qn(e, t) {
	let n = Gn(e), r = Gn(t);
	return Kn(Vn(n.numerator * r.denominator + r.numerator * n.denominator, n.denominator * r.denominator));
}
function $n(e, t) {
	let n = Gn(e), r = Gn(t);
	return Kn(Vn(n.numerator * r.numerator, n.denominator * r.denominator));
}
function er(e, t) {
	let n = Gn(e), r = Gn(t);
	return Kn(Vn(n.numerator * r.denominator - r.numerator * n.denominator, n.denominator * r.denominator));
}
function tr(e, t) {
	if (t === 0n) throw RangeError("Exact length divisor must not be zero");
	let n = Gn(e);
	return Kn(Vn(n.numerator, n.denominator * t));
}
function nr(e, t) {
	let n = Gn(e), r = Gn(t), i = n.numerator * r.denominator - r.numerator * n.denominator;
	return i < 0n ? -1 : +(i > 0n);
}
//#endregion
//#region packages/docx/src/layout/table-columns.ts
var U = 1e-9;
function rr(e, t, n, r) {
	let i = Number.isFinite(e) ? Math.max(0, e) : 0, a = Math.max(0, t), o = a + Math.max(1, n);
	return {
		startPt: a === 0 ? i : i / 2,
		endPt: o >= Math.max(0, r) ? i : i / 2
	};
}
function ir(e) {
	return Number.isFinite(e) ? Math.max(0, e) : 0;
}
function ar(e) {
	return e.map((e) => Math.abs(e) <= U ? 0 : e);
}
function or(e) {
	let t = e.gridWidthsPt.length;
	for (let n of e.rows) {
		for (let e of n.cells) t = Math.max(t, e.columnStart + Math.max(1, e.columnSpan));
		let e = n.cells.reduce((e, t) => Math.max(e, t.columnStart + Math.max(1, t.columnSpan)), n.before?.columnSpan ?? 0);
		t = Math.max(t, e + (n.after?.columnSpan ?? 0));
	}
	return t;
}
function sr(e, t, n) {
	let r = 0, i = Math.min(e.length, t + Math.max(1, n));
	for (let n = Math.max(0, t); n < i; n += 1) r += e[n] ?? 0;
	return r;
}
function cr(e, t) {
	return e ? e.kind === "pct" ? ir(e.value) * t : ir(e.value) : null;
}
function lr(e, t, n, r) {
	let i = Math.max(0, t), a = Math.max(1, Math.min(n, e.length - i));
	if (a <= 0) return;
	let o = sr(e, i, a);
	if (o <= U) {
		e[i + a - 1] = r;
		return;
	}
	let s = r / o;
	for (let t = i; t < i + a; t += 1) e[t] = (e[t] ?? 0) * s;
}
function ur(e, t, n, r) {
	let i = Math.max(0, t), a = Math.max(1, Math.min(n, e.length - i));
	if (a <= 0) return;
	let o = sr(e, i, a);
	r <= o + U || (e[i + a - 1] += r - o);
}
function dr(e, t) {
	let n = [];
	e.before && e.before.columnSpan > 0 && n.push({
		start: 0,
		span: e.before.columnSpan,
		preferred: e.before.preferredWidth
	});
	for (let t of e.cells) n.push({
		start: t.columnStart,
		span: t.columnSpan,
		preferred: t.preferredWidth
	});
	return e.after && e.after.columnSpan > 0 && n.push({
		start: Math.max(0, t - e.after.columnSpan),
		span: e.after.columnSpan,
		preferred: e.after.preferredWidth
	}), n;
}
function fr(e, t) {
	let n = Array.from({ length: t }, (t, n) => ir(e.gridWidthsPt[n] ?? 0)), r = n.reduce((e, t) => e + t, 0), i = e.tablePreferredWidthPt ?? (r > 0 ? r : ir(e.availableWidthPt));
	e.rows.forEach((e, r) => {
		for (let a of dr(e, t)) {
			let e = cr(a.preferred, i);
			e !== null && (r === 0 ? lr(n, a.start, a.span, e) : ur(n, a.start, a.span, e));
		}
	}), e.tablePreferredWidthPt === null && pr(n, e.rows);
	let a = e.tablePreferredWidthPt, o = n.reduce((e, t) => e + t, 0);
	if (a !== null && a >= 0 && o <= U && n.length > 0) return n.map(() => a / n.length);
	if (a !== null && a >= 0 && o > U) {
		let e = a / o;
		return n.map((t) => t * e);
	}
	return n;
}
function pr(e, t) {
	let n = Array(e.length).fill(0);
	for (let r of t) for (let t of r.cells) {
		if (t.columnSpan !== 1 || t.preferredWidth?.kind !== "pct") continue;
		let r = t.columnStart;
		r < 0 || r >= e.length || (n[r] = Math.max(n[r] ?? 0, ir(t.preferredWidth.value)));
	}
	let r = e.reduce((e, t) => e + t, 0), i = n.map((t, n) => t * r > e[n] + U), a = /* @__PURE__ */ new Set();
	for (; i.some(Boolean);) {
		let t = i.map((e) => e ? "1" : "0").join("");
		if (a.has(t)) return;
		a.add(t);
		let o = 0, s = 0;
		for (let t = 0; t < e.length; t += 1) i[t] ? s += n[t] ?? 0 : o += e[t] ?? 0;
		if (s >= 1 - U) return;
		r = o / (1 - s);
		let c = n.map((t, n) => t * r > e[n] + U);
		if (c.every((e, t) => e === i[t])) {
			for (let t = 0; t < e.length; t += 1) i[t] && (e[t] = n[t] * r);
			return;
		}
		i = c;
	}
}
function mr(e, t, n) {
	let r = Array(t).fill(0), i = Array(t).fill(0);
	for (let n of e) for (let e of n.cells) e.columnSpan !== 1 || e.columnStart < 0 || e.columnStart >= t || (r[e.columnStart] = Math.max(r[e.columnStart] ?? 0, ir(e.minContentWidthPt)), i[e.columnStart] = Math.max(i[e.columnStart] ?? 0, ir(e.maxContentWidthPt)));
	let a = Array(t).fill(!1);
	for (let o of e) for (let e of o.cells) {
		let o = e.columnStart;
		if (e.columnSpan !== 1 || o < 0 || o >= t || a[o] || e.preferredWidth === null) continue;
		let s = cr(e.preferredWidth, n);
		s !== null && (i[o] = Math.max(r[o] ?? 0, s), a[o] = !0);
	}
	for (let e = 0; e < t; e += 1) i[e] = Math.max(r[e] ?? 0, i[e] ?? 0);
	return {
		minimums: r,
		maximums: i
	};
}
function hr(e, t, n, r, i) {
	let a = Math.min(e.length, n + r), o = e.map((e, t) => t).filter((e) => e < n || e >= a), s = o.map((n) => Math.max(0, e[n] - (t[n] ?? 0))), c = s.reduce((e, t) => e + t, 0), l = Math.min(i, c);
	return l <= U || c <= U ? 0 : (o.forEach((t, n) => {
		e[t] -= l * ((s[n] ?? 0) / c);
	}), l);
}
function gr(e, t, n, r) {
	if (r <= U || n <= 0) return;
	let i = sr(e, t, n);
	for (let a = 0; a < n; a += 1) {
		let o = t + a, s = i > U ? (e[o] ?? 0) / i : 1 / n;
		e[o] += r * s;
	}
}
function _r(e, t, n, r) {
	let i = Math.max(0, r.columnStart), a = Math.max(1, Math.min(r.columnSpan, e.length - i));
	if (a <= 0) return;
	let o = ir(r.minContentWidthPt), s = sr(e, i, a);
	if (o <= s + U) return;
	let c = a === 1 ? n[i] ?? o : Math.max(o, ir(r.maxContentWidthPt));
	gr(e, i, a, hr(e, t, i, a, Math.max(0, c - s)));
	let l = sr(e, i, a);
	l < o - U && gr(e, i, a, o - l);
}
function vr(e, t, n, r) {
	let i = e.reduce((e, t) => e + t, 0);
	if (i <= r + U || i <= U) return e;
	let a = [...e], o = a.map((e, n) => Math.max(0, e - (t[n] ?? 0))), s = o.reduce((e, t) => e + t, 0), c = Math.min(i - r, s);
	c > U && s > U && a.forEach((e, t) => {
		a[t] -= c * ((o[t] ?? 0) / s);
	});
	for (let e of n) {
		if (e.columnSpan <= 1) continue;
		let n = Math.max(0, e.columnStart), r = Math.max(1, Math.min(e.columnSpan, a.length - n)), i = ir(e.minContentWidthPt) - sr(a, n, r);
		if (i <= U) continue;
		let o = hr(a, t, n, r, i);
		gr(a, n, r, o), o < i - U && gr(a, n, r, i - o);
	}
	let l = a.reduce((e, t) => e + t, 0);
	if (l <= r + U || l <= U) return ar(a);
	let u = Math.max(0, r) / l;
	return ar(a.map((e) => e * u));
}
function yr(e) {
	let t = or(e);
	if (t === 0) return Object.freeze([]);
	let n = fr(e, t);
	if (e.layout === "fixed") {
		let t = n.reduce((e, t) => e + t, 0), r = ir(e.availableWidthPt);
		if (t <= r + U || t <= U) return Object.freeze(n);
		let i = r / t;
		return Object.freeze(ar(n.map((e) => e * i)));
	}
	let r = n.reduce((e, t) => e + t, 0), { minimums: i, maximums: a } = mr(e.rows, t, r), o = e.rows.flatMap((e) => e.cells);
	o.sort((e, t) => e.columnSpan - t.columnSpan);
	for (let e of o) _r(n, i, a, e);
	return Object.freeze(vr(n, i, o, ir(e.availableWidthPt)));
}
function br(e) {
	let t = yr(e), n = t.map((t, n) => {
		let r = t !== e.gridWidthsPt[n];
		return !r && e.gridWidthKeys?.[n] === null ? null : !r && e.gridWidthKeys?.[n] !== void 0 ? e.gridWidthKeys[n] : Jn(t) ?? "0/1";
	});
	return Object.freeze({
		widthsPt: Object.freeze([...t]),
		widthKeys: Object.freeze(n)
	});
}
function xr(e) {
	return br(e).widthsPt;
}
//#endregion
//#region packages/docx/src/layout/text.ts
function Sr(e, t) {
	let n = (e.smallCaps ? Math.max(e.fontSize - 2, 1) : e.fontSize) * t;
	return e.vertAlign && (n *= .65), n;
}
var Cr = /[ᄀ-ᇿ⺀-⿟　-〿぀-ヿ㄰-㆏㐀-䶿一-鿿ꥠ-꥿가-퟿豈-﫿＀-￯]/u;
function wr(e, t, n) {
	let r = null, i = 0;
	for (let n of t) n.pos > i && (i = n.pos), n.pos > e && (r === null || n.pos < r.pos) && (r = n);
	let a = null;
	if (n > 0) {
		let t = Math.ceil((Math.max(e, i) + 1e-6) / n) * n;
		t <= e && (t += n), a = {
			pos: t,
			alignment: "left"
		};
	}
	return r && a ? r.pos <= a.pos ? r : a : r ?? a;
}
function Tr(e, t, n) {
	return wr(e, t, n);
}
function Er(e, t) {
	let n = t === "vert" || t === "vert270" || t === "eaVert" || t === "mongolianVert";
	return {
		type: "text",
		text: e.text,
		bold: e.bold ?? !1,
		italic: e.italic ?? !1,
		underline: !1,
		strikethrough: !1,
		fontSize: e.fontSizePt,
		color: e.color ?? null,
		fontFamily: e.fontFamily ?? null,
		fontFamilyEastAsia: e.fontFamilyEastAsia ?? null,
		isLink: !1,
		background: null,
		vertAlign: null,
		hyperlink: null,
		ruby: e.ruby ?? void 0,
		textBoxLineFloor: !0,
		textBoxVertical: n
	};
}
function Dr(e, t = {}, n = {}) {
	if (!e) return "sans-serif";
	let r = t[e];
	return r === "roman" ? "serif" : r === "swiss" ? "sans-serif" : r === "modern" && n[e] === "fixed" ? "monospace" : "sans-serif";
}
var Or = Symbol("docx.localMetricSnapshot");
function kr(e = {}) {
	if (e[Or]) return e;
	let t = Object.entries(e).map(([e, t]) => {
		if (!t.family?.trim()) throw TypeError(`Local metric ${e} requires a family`);
		if (t.lineHeightRatio !== void 0 && (!Number.isFinite(t.lineHeightRatio) || t.lineHeightRatio < 0)) throw RangeError(`Local metric ${e} lineHeightRatio must be finite and non-negative`);
		if (t.weight !== void 0 && (!Number.isFinite(t.weight) || t.weight < 1 || t.weight > 1e3)) throw RangeError(`Local metric ${e} weight must be finite and between 1 and 1000`);
		let n = {
			family: t.family,
			...t.lineHeightRatio === void 0 ? {} : { lineHeightRatio: t.lineHeightRatio },
			...t.requestedFamily === void 0 ? {} : { requestedFamily: t.requestedFamily },
			...t.weight === void 0 ? {} : { weight: t.weight },
			...t.style === void 0 ? {} : { style: t.style },
			...t.sourceIdentity === void 0 ? {} : { sourceIdentity: t.sourceIdentity },
			...t.synthesized === void 0 ? {} : { synthesized: t.synthesized }
		};
		return [mn(e), Object.freeze(n)];
	}).sort(([e], [t]) => e.localeCompare(t)), n = Object.fromEntries(t);
	return Object.defineProperty(n, Or, { value: !0 }), Object.freeze(n);
}
var Ar = new Set([
	161,
	164,
	167,
	168,
	170,
	173,
	175,
	176,
	177,
	178,
	179,
	180,
	182,
	183,
	184,
	185,
	186,
	188,
	189,
	190,
	191,
	215,
	247
]), jr = new Set([
	224,
	225,
	232,
	233,
	234,
	236,
	237,
	242,
	243,
	249,
	250,
	252
]);
function Mr(e, t, n, r, i) {
	let a = n === "eastAsia", o = r?.split(/[-_]/, 1)[0]?.toLowerCase() === "zh", s = /^(?:86|88)$/i.test(i?.trim() ?? ""), c = "highAnsi";
	return e <= 127 ? c = "ascii" : e <= 255 ? c = a && (Ar.has(e) || o && jr.has(e)) ? "eastAsia" : "highAnsi" : e >= 256 && e <= 687 ? c = a && (o || s) ? "eastAsia" : "highAnsi" : e >= 688 && e <= 767 || e >= 768 && e <= 879 || e >= 880 && e <= 975 || e >= 1024 && e <= 1279 ? c = a ? "eastAsia" : "highAnsi" : e >= 1424 && e <= 1983 || e >= 64285 && e <= 65023 || e >= 65136 && e <= 65278 ? c = "ascii" : e >= 4352 && e <= 4607 || e >= 11904 && e <= 12031 || e >= 12032 && e <= 12255 || e >= 12272 && e <= 12687 || e >= 12688 && e <= 12703 || e >= 12800 && e <= 19903 || e >= 19968 && e <= 40879 || e >= 40960 && e <= 42127 || e >= 42128 && e <= 42191 || e >= 44032 && e <= 55215 || e >= 63744 && e <= 64255 || e >= 65072 && e <= 65103 || e >= 65104 && e <= 65135 || e >= 65280 && e <= 65519 || e >= 65536 && e <= 1114111 ? c = "eastAsia" : e >= 7680 && e <= 7935 ? c = a && o ? "eastAsia" : "highAnsi" : (e >= 8192 && e <= 10175 || e >= 57344 && e <= 63743 || e >= 64256 && e <= 64284) && (c = a ? "eastAsia" : "highAnsi"), c === "eastAsia" && a ? c : t ? "complexScript" : c;
}
function Nr(e, t) {
	return e.themeFontPresence?.[t] ?? e.themeFonts?.[t] != null ? e.themeFonts?.[t] : e.fonts[t] ?? (e.themeFontPresence?.ascii ?? e.themeFonts?.ascii != null ? e.themeFonts?.ascii : e.fonts.ascii);
}
function Pr(e) {
	let t = kr(e.localMetrics), n = Object.freeze(Object.fromEntries(Object.entries(e.genericFamilies ?? {}).map(([e, t]) => [e.trim().toLocaleLowerCase("en-US"), t]).sort(([e], [t]) => e.localeCompare(t)))), r = Object.freeze(Object.fromEntries(Object.entries(e.eastAsiaFontCharsets ?? {}).map(([e, t]) => [e.trim().toLocaleLowerCase("en-US"), t.trim()]).sort(([e], [t]) => e.localeCompare(t)))), a = On("text", {
		fonts: e.fonts.fingerprint,
		measurer: e.measurer.fingerprint,
		localMetrics: t,
		eastAsiaFontCharsets: r,
		genericFamilies: n
	}), o = (t) => {
		let r = Nr(t, t.slot), i = r ? n[r.trim().toLocaleLowerCase("en-US")] ?? t.genericFamily ?? "sans-serif" : t.genericFamily;
		return e.fonts.resolve({
			requestedFamily: r,
			genericFamily: i,
			weight: t.weight,
			style: t.style
		});
	}, s = /* @__PURE__ */ new Map(), c = (t) => {
		let n = JSON.stringify([
			t.text,
			t.fontRoute.familyList,
			t.fontRoute.scope,
			t.fontRoute.fingerprint,
			t.fontSizePt,
			t.weight,
			t.style,
			t.letterSpacingPt,
			t.kerning ?? null
		]), r = s.get(n);
		if (r) return r;
		let i = e.measurer.measure(t), a = Object.freeze({
			...i,
			...i.inkBounds ? { inkBounds: Object.freeze({ ...i.inkBounds }) } : {}
		});
		return s.set(n, a), a;
	}, l = (t) => e.measurer.measure(t).advancePt, u = /* @__PURE__ */ new Map();
	return Object.freeze({
		fingerprint: a,
		localMetrics: t,
		resolve: o,
		shape(e) {
			if (!Number.isFinite(e.fontSizePt) || e.fontSizePt < 0) throw RangeError("fontSizePt must be a finite non-negative number");
			let t = JSON.stringify([
				e.text,
				e.fontSizePt,
				[
					e.fonts.ascii ?? null,
					e.fonts.highAnsi ?? null,
					e.fonts.eastAsia ?? null,
					e.fonts.complexScript ?? null
				],
				[
					e.themeFonts?.ascii ?? null,
					e.themeFonts?.highAnsi ?? null,
					e.themeFonts?.eastAsia ?? null,
					e.themeFonts?.complexScript ?? null
				],
				[
					e.themeFontPresence?.ascii ?? null,
					e.themeFontPresence?.highAnsi ?? null,
					e.themeFontPresence?.eastAsia ?? null,
					e.themeFontPresence?.complexScript ?? null
				],
				e.weight ?? null,
				e.style ?? null,
				e.complexScript ?? null,
				e.fontHint ?? null,
				e.eastAsiaLanguage ?? null,
				e.eastAsiaFontCharset ?? null,
				e.genericFamily ?? null,
				e.letterSpacingPt ?? null,
				e.kerning ?? null,
				e.measure ?? null,
				e.clusterGeometry ?? null
			]), n = u.get(t);
			if (n) return n;
			let a = [], s = Object.freeze([...new Set([
				0,
				...i(e.text),
				e.text.length
			])].sort((e, t) => e - t)), d = new Set(s), f = 0;
			for (let t of e.text) {
				let n = f + t.length, i = Nr(e, "eastAsia"), o = e.eastAsiaFontCharset ?? (i ? r[i.trim().toLocaleLowerCase("en-US")] : void 0), s = Mr(t.codePointAt(0) ?? 0, e.complexScript ?? !1, e.fontHint, e.eastAsiaLanguage, o), c = a.at(-1);
				c?.script === s ? (c.text += t, c.end = n) : a.push({
					text: t,
					start: f,
					end: n,
					script: s,
					breakBefore: d.has(f)
				}), f = n;
			}
			let p = a.map((t) => {
				let n = o({
					fonts: e.fonts,
					themeFonts: e.themeFonts,
					themeFontPresence: e.themeFontPresence,
					slot: t.script,
					weight: e.weight,
					style: e.style,
					genericFamily: e.genericFamily
				}), r = e.measure === !1 ? {
					advancePt: 0,
					ascentPt: 0,
					descentPt: 0
				} : c({
					text: t.text,
					fontRoute: n.route,
					fontSizePt: e.fontSizePt,
					weight: n.weight,
					style: n.style,
					letterSpacingPt: e.letterSpacingPt ?? 0,
					kerning: e.kerning
				});
				return Object.freeze({
					...t,
					...r,
					font: n,
					fontRoute: n.route
				});
			}), m = p.flatMap((e) => e.font.diagnostics), h = p.length > 0 && p.every((e) => e.inkBounds !== void 0) ? (() => {
				let e = 0, t = Infinity, n = -Infinity, r = 0, i = 0;
				for (let a of p) {
					let o = a.inkBounds;
					t = Math.min(t, e + o.xMinPt), n = Math.max(n, e + o.xMaxPt), r = Math.max(r, o.ascentPt), i = Math.max(i, o.descentPt), e += a.advancePt;
				}
				return Object.freeze({
					xMinPt: t,
					xMaxPt: n,
					ascentPt: r,
					descentPt: i
				});
			})() : void 0, g = p.reduce((e, t) => e + t.advancePt, 0), _ = e.clusterGeometry === !1 ? void 0 : (() => {
				let t = new Map([[0, 0], [e.text.length, g]]), n = (n) => {
					if (e.measure === !1 || n <= 0) return 0;
					let r = t.get(n);
					if (r !== void 0) return r;
					let i = 0;
					for (let t of p) {
						if (n >= t.end) {
							i += t.advancePt;
							continue;
						}
						if (n <= t.start) break;
						i += l({
							text: t.text.slice(0, n - t.start),
							fontRoute: t.fontRoute,
							fontSizePt: e.fontSizePt,
							weight: t.font.weight,
							style: t.font.style,
							letterSpacingPt: e.letterSpacingPt ?? 0,
							kerning: e.kerning
						});
						break;
					}
					return t.set(n, i), i;
				};
				return Object.freeze(s.slice(0, -1).map((e, t) => {
					let r = s[t + 1] ?? e, i = n(e);
					return Object.freeze({
						range: Object.freeze({
							start: e,
							end: r
						}),
						offsetPt: i,
						advancePt: n(r) - i
					});
				}));
			})(), v = Object.freeze({
				advancePt: g,
				ascentPt: Math.max(0, ...p.map((e) => e.ascentPt)),
				descentPt: Math.max(0, ...p.map((e) => e.descentPt)),
				...h ? { inkBounds: h } : {},
				...h && p.every((e) => e.horizontalInkBoundsAreTight === !0) ? { horizontalInkBoundsAreTight: !0 } : {},
				spans: Object.freeze(p),
				graphemeBoundaries: s,
				..._ ? { clusters: _ } : {},
				diagnostics: Object.freeze(m)
			});
			return u.set(t, v), v;
		}
	});
}
//#endregion
//#region packages/docx/src/fit-text.ts
function Fr(e, t) {
	let n = [];
	for (let r = 0; r < e.length;) {
		let i = e[r];
		if (i.fitTextValTwips === void 0) {
			r += 1;
			continue;
		}
		let a = r + 1;
		if (i.fitTextId !== void 0) for (; a < e.length && e[a].fitTextValTwips !== void 0 && e[a].fitTextId === i.fitTextId;) a += 1;
		let o = 0, s = 0;
		for (let t = r; t < a; t += 1) {
			let n = e[t];
			o += n.naturalWidthPx * (n.charScale ?? 1), s += n.charCount;
		}
		let c = i.fitTextValTwips / 20 * t, l = s > 1 ? (c - o) / (s - 1) : 0, u = c - o - Math.max(0, s - 1) * l;
		n.push({
			start: r,
			end: a,
			targetPx: c,
			naturalPx: o,
			charCount: s,
			perGapPx: l,
			trailingPadPx: u
		}), r = a;
	}
	return n;
}
//#endregion
//#region packages/docx/src/layout/exact-geometry.ts
function Ir(e) {
	return e < 0n ? -e : e;
}
function Lr(e, t) {
	let n = Ir(e), r = Ir(t);
	for (; r !== 0n;) {
		let e = n % r;
		n = r, r = e;
	}
	return n;
}
function W(e, t) {
	if (t === 0n) throw Error("Exact rational denominator must be nonzero");
	if (e === 0n) return Object.freeze({
		numerator: 0n,
		denominator: 1n
	});
	let n = t < 0n ? -1n : 1n, r = Lr(e, t);
	return Object.freeze({
		numerator: n * e / r,
		denominator: n * t / r
	});
}
function G(e, t) {
	let n = e.numerator * t.denominator - t.numerator * e.denominator;
	return n < 0n ? -1 : +(n > 0n);
}
function Rr(e, t) {
	return W(e.numerator * t.denominator - t.numerator * e.denominator, e.denominator * t.denominator);
}
function zr(e, t) {
	return W(e.numerator * t.denominator + t.numerator * e.denominator, 2n * e.denominator * t.denominator);
}
function Br(e) {
	return `${e.numerator}/${e.denominator}`;
}
var Vr = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(8));
function Hr(e) {
	if (!Number.isFinite(e)) throw Error("Exact geometry requires a finite binary64 value");
	if (e === 0) return Object.freeze({
		coefficient: 0n,
		exponent: 0
	});
	Vr.setFloat64(0, e, !1);
	let t = Vr.getBigUint64(0, !1), n = t >> 63n != 0n, r = Number(t >> 52n & 2047n), i = t & (1n << 52n) - 1n, a = r === 0 ? i : 1n << 52n | i, o = r === 0 ? -1074 : r - 1023 - 52;
	for (; (a & 1n) == 0n;) a >>= 1n, o += 1;
	return Object.freeze({
		coefficient: n ? -a : a,
		exponent: o
	});
}
function Ur(e) {
	return e === 0n ? 0 : e.toString(2).length;
}
function Wr(e, t, n) {
	let r = n >= 0 ? e : e << BigInt(-n), i = n >= 0 ? t << BigInt(n) : t;
	return r < i ? -1 : +(r > i);
}
function Gr(e, t, n) {
	let r = n >= 0 ? e << BigInt(n) : e, i = n >= 0 ? t : t << BigInt(-n), a = r / i, o = r % i * 2n;
	return (o > i || o === i && (a & 1n) != 0n) && (a += 1n), a;
}
function Kr(e) {
	return Vr.setBigUint64(0, e, !1), Vr.getFloat64(0, !1);
}
function qr(e) {
	if (e.numerator === 0n) return 0;
	let t = e.numerator < 0n, n = Ir(e.numerator), r = e.denominator, i = Ur(n) - Ur(r);
	Wr(n, r, i) < 0 && --i;
	let a = t ? 1n << 63n : 0n;
	if (i < -1022) {
		let e = Gr(n, r, 1074);
		return Kr(e === 0n ? a : e >= 1n << 52n ? a | 1n << 52n : a | e);
	}
	let o = Gr(n, r, 52 - i);
	if (o === 1n << 53n && (o >>= 1n, i += 1), i > 1023) return t ? -Infinity : Infinity;
	let s = BigInt(i + 1023) << 52n, c = o - (1n << 52n);
	return Kr(a | s | c);
}
function Jr(e) {
	if (e === Infinity) return e;
	if (Object.is(e, -0) || e === 0) return Number.MIN_VALUE;
	Vr.setFloat64(0, e, !1);
	let t = Vr.getBigUint64(0, !1);
	return Kr(e > 0 ? t + 1n : t - 1n);
}
function Yr(e) {
	let t = qr(e);
	if (t === Infinity) return t;
	if (t === -Infinity) return -Number.MAX_VALUE;
	let n = Hr(t);
	return G(n.exponent >= 0 ? {
		numerator: n.coefficient << BigInt(n.exponent),
		denominator: 1n
	} : {
		numerator: n.coefficient,
		denominator: 1n << BigInt(-n.exponent)
	}, e) >= 0 ? t : Jr(t);
}
function Xr(e) {
	return -Yr({
		numerator: -e.numerator,
		denominator: e.denominator
	});
}
//#endregion
//#region packages/docx/src/layout/polygon-wrap.ts
function Zr(e) {
	if (!e.points || e.points.length < 3 || e.points.some((e) => !Number.isFinite(e.xPt) || !Number.isFinite(e.yPt))) throw Error(`Invalid ${e.kind} wrapPolygon for ${e.imageKey}`);
	if (![
		e.xLeftPt,
		e.xRightPt,
		e.yTopPt,
		e.yBottomPt
	].every(Number.isFinite) || e.xRightPt < e.xLeftPt || e.yBottomPt < e.yTopPt) throw Error(`Invalid finite wrap bounds for ${e.imageKey}`);
}
var Qr = /* @__PURE__ */ new WeakMap();
function $r(e, t) {
	return e.x === t.x && e.y === t.y;
}
function ei(e, t, n, r) {
	return e * r - t * n;
}
function ti(e, t) {
	return t > 0n ? e >= 0n && e <= t : e <= 0n && e >= t;
}
function ni(e, t) {
	let n = $r(e.from, t.from) || $r(e.from, t.to) ? e.from : $r(e.to, t.from) || $r(e.to, t.to) ? e.to : null;
	if (n) return Object.freeze({
		y: W(n.y, 1n),
		contact: "shared-endpoint"
	});
	let r = e.to.x - e.from.x, i = e.to.y - e.from.y, a = t.to.x - t.from.x, o = t.to.y - t.from.y, s = ei(r, i, a, o);
	if (s === 0n) return null;
	let c = t.from.x - e.from.x, l = t.from.y - e.from.y, u = ei(c, l, a, o), d = ei(c, l, r, i);
	return !ti(u, s) || !ti(d, s) ? null : Object.freeze({
		y: W(e.from.y * s + i * u, s),
		contact: i === 0n || o === 0n ? "horizontal" : "active-crossing"
	});
}
function ri(e, t) {
	return `${e}:${t}`;
}
function ii(e, t, n) {
	let r = /* @__PURE__ */ new Set();
	for (let i of t) {
		if (i < 0 || i >= Math.floor(e.length / 2)) continue;
		n();
		let t = e[i * 2], a = e[i * 2 + 1];
		r.add(ri(t, a));
	}
	return r;
}
function ai(e) {
	let t = (e) => {
		if (e.length === 0) return null;
		let n = e[Math.floor(e.length / 2)].yTopPt, r = [], i = [], a = [];
		for (let t of e) t.yBottomPt <= n ? r.push(t) : t.yTopPt > n ? i.push(t) : a.push(t);
		return Object.freeze({
			centerYPt: n,
			crossingByTop: Object.freeze(a),
			crossingByBottom: Object.freeze(a.slice().sort((e, t) => t.yBottomPt - e.yBottomPt)),
			below: t(r),
			above: t(i)
		});
	};
	return t(e.slice().sort((e, t) => e.yTopPt - t.yTopPt || e.yBottomPt - t.yBottomPt));
}
function oi(e, t) {
	return qr(t >= 0 ? {
		numerator: e.numerator << BigInt(t),
		denominator: e.denominator
	} : {
		numerator: e.numerator,
		denominator: e.denominator << BigInt(-t)
	});
}
function si(e, t) {
	return Yr(t >= 0 ? {
		numerator: e.numerator << BigInt(t),
		denominator: e.denominator
	} : {
		numerator: e.numerator,
		denominator: e.denominator << BigInt(-t)
	});
}
function ci(e, t) {
	let n = Hr(e), r = n.exponent - t;
	return r >= 0 ? {
		numerator: n.coefficient << BigInt(r),
		denominator: 1n
	} : {
		numerator: n.coefficient,
		denominator: 1n << BigInt(-r)
	};
}
function li(e, t, n) {
	let r = e.dx * n.numerator - e.c * n.denominator, i = t.dx * n.numerator - t.c * n.denominator, a = r * t.dy - i * e.dy;
	return a < 0n ? -1 : +(a > 0n);
}
function ui(e) {
	let t = (e) => {
		if (e.length === 0) return null;
		let n = e[Math.floor(e.length / 2)].yTop, r = [], i = [], a = [];
		for (let t of e) G(t.yBottom, n) <= 0 ? r.push(t) : G(t.yTop, n) > 0 ? i.push(t) : a.push(t);
		return Object.freeze({
			centerY: n,
			crossingByTop: Object.freeze(a),
			crossingByBottom: Object.freeze(a.slice().sort((e, t) => G(t.yBottom, e.yBottom))),
			below: t(r),
			above: t(i)
		});
	};
	return t(e.slice().sort((e, t) => G(e.yTop, t.yTop) || G(e.yBottom, t.yBottom)));
}
function di(e, t, n, r) {
	if (!(!e || G(n, t) <= 0)) {
		if (G(n, e.centerY) <= 0) {
			for (let t of e.crossingByTop) {
				if (G(t.yTop, n) >= 0) break;
				r.push(t);
			}
			di(e.below, t, n, r);
			return;
		}
		if (G(t, e.centerY) >= 0) {
			for (let n of e.crossingByBottom) {
				if (G(n.yBottom, t) <= 0) break;
				r.push(n);
			}
			di(e.above, t, n, r);
			return;
		}
		r.push(...e.crossingByTop), di(e.below, t, n, r), di(e.above, t, n, r);
	}
}
function fi(e, t, n, r, i) {
	let a = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map();
	t.forEach((e, t) => {
		if (e.minY === e.maxY) return;
		let n = Br(W(e.minY, 1n)), r = Br(W(e.maxY, 1n)), i = a.get(n);
		i ? i.push(t) : a.set(n, [t]);
		let s = o.get(r);
		s ? s.push(t) : o.set(r, [t]);
	});
	let s = /* @__PURE__ */ new Map();
	for (let e of i) {
		if (e.contact !== "active-crossing") continue;
		let t = Br(e.y), n = s.get(t);
		n || s.set(t, n = /* @__PURE__ */ new Set()), n.add(e.leftEdge), n.add(e.rightEdge);
	}
	let c = [], l = /* @__PURE__ */ new Set(), u = /* @__PURE__ */ new Map(), d = [], f = [], p = 0, m = 0, h = (t, n, i) => {
		for (let a of t) {
			if (n.has(a)) continue;
			let t = u.get(a);
			if (t && G(i, t.yTop) > 0) {
				let n = Object.freeze({
					yTop: t.yTop,
					yBottom: i,
					leftEdge: t.leftEdge,
					rightEdge: t.rightEdge
				});
				d.push(n);
				let a = oi(t.yTop, r), o = oi(i, r);
				o > a && f.push(Object.freeze({
					yTopPt: a,
					yBottomPt: o,
					left: e[t.leftEdge],
					right: e[t.rightEdge]
				}));
			}
			u.delete(a);
		}
		for (let e of n) {
			if (t.has(e)) continue;
			let n = e.indexOf(":");
			u.set(e, {
				leftEdge: Number(e.slice(0, n)),
				rightEdge: Number(e.slice(n + 1)),
				yTop: i
			});
		}
	}, g = /* @__PURE__ */ new Map(), _ = (e, t) => {
		e.add(Math.floor((t - 1) / 2)), e.add(Math.floor(t / 2)), e.add(Math.floor((t + 1) / 2));
	}, v = (e) => ii(c, e, () => {
		m += 2;
	}), y = () => {
		let e = /* @__PURE__ */ new Set();
		for (let t = 0; t + 1 < c.length; t += 2) m += 2, e.add(ri(c[t], c[t + 1]));
		return e;
	};
	for (let e = 0; e < n.length; e += 1) {
		let r = n[e], i = n[e + 1], u = i ? zr(r, i) : r, d = (e, n) => (p += 1, li(t[e], t[n], u) || e - n), f = (e) => {
			let t = 0, n = c.length;
			for (; t < n;) {
				let r = t + n >>> 1;
				d(c[r], e) <= 0 ? t = r + 1 : n = r;
			}
			c.splice(t, 0, e);
			for (let e = t; e < c.length; e += 1) g.set(c[e], e);
		}, m = (e) => {
			let t = g.get(e);
			if (t !== void 0) {
				c.splice(t, 1), g.delete(e);
				for (let e = t; e < c.length; e += 1) g.set(c[e], e);
			}
		}, b = (e) => {
			let n = [...e].filter((e) => g.has(e) && G(W(t[e].minY, 1n), r) <= 0 && G(r, W(t[e].maxY, 1n)) < 0), i = n.map((e) => g.get(e)).sort((e, t) => e - t);
			n.sort(d);
			for (let e = 0; e < i.length; e += 1) {
				let t = i[e], r = n[e];
				c[t] = r, g.set(r, t);
			}
		}, x = Br(r), S = o.get(x) ?? [], C = a.get(x) ?? [], w = s.get(x) ?? l;
		if (S.length === 0 && C.length === 0 && (w.size === 0 || i === void 0)) continue;
		let T = S.length > 0 || C.length > 0, E = /* @__PURE__ */ new Set();
		if (!T) for (let e of w) {
			let t = g.get(e);
			t !== void 0 && _(E, t);
		}
		let D = T ? y() : v(E);
		for (let e of S) m(e);
		for (let e of C) f(e);
		if (w.size > 0 && i !== void 0 && b(w), c.length % 2 != 0) throw Error("Compiled wrapPolygon produced an odd open-slab crossing count");
		if (T) h(D, y(), r);
		else {
			let e = /* @__PURE__ */ new Set();
			for (let t of w) {
				let n = g.get(t);
				n !== void 0 && _(e, n);
			}
			h(D, v(e), r);
		}
	}
	return Object.freeze({
		spans: Object.freeze(f),
		exactSpans: Object.freeze(d),
		orderComparisonCount: p,
		pairMembershipVisitCount: m
	});
}
function pi(e) {
	Zr(e);
	let t = e.points, n = Object.freeze(t.map((e) => Object.freeze({ ...e }))), r = [
		...n.flatMap((e) => [e.xPt, e.yPt]),
		e.xLeftPt,
		e.xRightPt,
		e.yTopPt,
		e.yBottomPt
	].map(Hr).filter(({ coefficient: e }) => e !== 0n), i = r.length === 0 ? 0 : Math.min(...r.map(({ exponent: e }) => e)), a = (e) => {
		let t = Hr(e);
		return t.coefficient === 0n ? 0n : t.coefficient << BigInt(t.exponent - i);
	}, o = n.map((e) => Object.freeze({
		x: a(e.xPt),
		y: a(e.yPt)
	})), s = n.map((e, t) => {
		let r = n[(t + 1) % n.length], i = r.yPt - e.yPt, a = i === 0 ? 0 : (r.xPt - e.xPt) / i;
		return Object.freeze({
			from: e,
			to: r,
			minYPt: Math.min(e.yPt, r.yPt),
			maxYPt: Math.max(e.yPt, r.yPt),
			slopeXPerY: a,
			interceptX: i === 0 ? e.xPt : e.xPt - a * e.yPt
		});
	}), c = o.map((e, t) => {
		let n = o[(t + 1) % o.length], r = e.y <= n.y ? e : n, i = e.y <= n.y ? n : e, a = i.x - r.x, s = i.y - r.y;
		return Object.freeze({
			index: t,
			from: e,
			to: n,
			minY: r.y,
			maxY: i.y,
			dx: a,
			dy: s,
			c: a * r.y - s * r.x
		});
	}), l = [];
	for (let e = 0; e < c.length; e += 1) for (let t = e + 1; t < c.length; t += 1) {
		let n = ni(c[e], c[t]);
		n && l.push(Object.freeze({
			y: n.y,
			contact: n.contact,
			leftEdge: e,
			rightEdge: t
		}));
	}
	let u = Infinity, d = -Infinity, f = Infinity, p = -Infinity;
	for (let e of n) u = Math.min(u, e.xPt), d = Math.max(d, e.xPt), f = Math.min(f, e.yPt), p = Math.max(p, e.yPt);
	let m = /* @__PURE__ */ new Map();
	for (let e of o) {
		let t = W(e.y, 1n);
		m.set(Br(t), t);
	}
	for (let e of l) m.set(Br(e.y), e.y);
	let h = Object.freeze([...m.values()].sort(G)), g = Object.freeze([...new Set(h.map((e) => oi(e, i)))].sort((e, t) => e - t)), _ = fi(s, c, h, i, l), v = W(o.reduce((e, t) => t.x < e ? t.x : e, o[0].x), 1n), y = W(o.reduce((e, t) => t.x > e ? t.x : e, o[0].x), 1n), b = W(o.reduce((e, t) => t.y < e ? t.y : e, o[0].y), 1n), x = W(o.reduce((e, t) => t.y > e ? t.y : e, o[0].y), 1n), S = W(0n, 1n), C = (e, t) => {
		let n = Rr(e, t);
		return G(n, S) > 0 ? n : S;
	}, w = Object.freeze({
		scaleExponent: i,
		edges: Object.freeze(c),
		eventYs: h,
		spans: _.exactSpans,
		spanIndex: ui(_.exactSpans),
		polygonLeft: v,
		polygonRight: y,
		polygonTop: b,
		polygonBottom: x,
		padLeft: C(v, W(a(e.xLeftPt), 1n)),
		padRight: C(W(a(e.xRightPt), 1n), y),
		padTop: C(b, W(a(e.yTopPt), 1n)),
		padBottom: C(W(a(e.yBottomPt), 1n), x)
	}), T = Object.freeze({
		kind: e.kind,
		edges: Object.freeze(s),
		eventYPts: g,
		contourSpans: _.spans,
		contourSpanIndex: ai(_.spans),
		intersectionCount: l.length,
		compileOrderComparisonCount: _.orderComparisonCount,
		compilePairMembershipVisitCount: _.pairMembershipVisitCount,
		polygonLeftPt: u,
		polygonRightPt: d,
		polygonTopPt: f,
		polygonBottomPt: p,
		padLeftPt: Math.max(0, u - e.xLeftPt),
		padRightPt: Math.max(0, e.xRightPt - d),
		padTopPt: Math.max(0, f - e.yTopPt),
		padBottomPt: Math.max(0, e.yBottomPt - p)
	});
	return Qr.set(T, w), T;
}
function mi(e, t) {
	return {
		numerator: e.dx * t.numerator - e.c * t.denominator,
		denominator: e.dy * t.denominator
	};
}
function hi(e, t) {
	return e.dx * t.dy === t.dx * e.dy && e.c * t.dy === t.c * e.dy;
}
function gi(e) {
	let t = e.filter((e) => G(e.r, e.l) > 0).slice().sort((e, t) => G(e.l, t.l) || G(e.r, t.r)), n = [];
	for (let e of t) {
		let t = n.at(-1);
		!t || G(e.l, t.r) > 0 ? n.push({ ...e }) : G(e.r, t.r) > 0 && (n[n.length - 1] = {
			l: t.l,
			r: e.r
		});
	}
	return n;
}
function _i(e, t) {
	return {
		numerator: e.numerator * t.denominator + t.numerator * e.denominator,
		denominator: e.denominator * t.denominator
	};
}
function vi(e, t) {
	return {
		numerator: e.numerator * t.denominator - t.numerator * e.denominator,
		denominator: e.denominator * t.denominator
	};
}
function yi(e, t, n) {
	let r = Qr.get(e);
	if (!r) throw Error("Compiled polygon omitted its exact geometry authority");
	let i = vi(t, r.padBottom), a = _i(n, r.padTop), o = G(r.polygonTop, i) >= 0 ? r.polygonTop : i, s = G(r.polygonBottom, a) <= 0 ? r.polygonBottom : a;
	if (G(s, o) <= 0) return [];
	let c = [], l = [];
	di(r.spanIndex, o, s, l);
	for (let e of l) {
		let t = G(o, e.yTop) >= 0 ? o : e.yTop, n = G(s, e.yBottom) <= 0 ? s : e.yBottom;
		if (G(n, t) <= 0) continue;
		let i = r.edges[e.leftEdge], a = r.edges[e.rightEdge];
		if (hi(i, a)) continue;
		let l = mi(i, t), u = mi(i, n), d = mi(a, t), f = mi(a, n);
		c.push({
			l: vi(G(l, u) <= 0 ? l : u, r.padLeft),
			r: _i(G(d, f) >= 0 ? d : f, r.padRight)
		});
	}
	let u = gi(c);
	return e.kind === "through" || u.length === 0 ? u : [{
		l: u[0].l,
		r: u.at(-1).r
	}];
}
function bi(e, t, n) {
	let r = Qr.get(e);
	if (!r) throw Error("Compiled polygon omitted its exact geometry authority");
	let i = ci(t, r.scaleExponent), a = _i(i, ci(n, r.scaleExponent)), o = (e) => r.scaleExponent >= 0 ? {
		numerator: e.numerator << BigInt(r.scaleExponent),
		denominator: e.denominator
	} : {
		numerator: e.numerator,
		denominator: e.denominator << BigInt(-r.scaleExponent)
	};
	return Object.freeze(yi(e, i, a).map((e) => Object.freeze({
		l: o(e.l),
		r: o(e.r)
	})));
}
function xi(e, t) {
	let n = Qr.get(e);
	if (!n) throw Error("Compiled polygon omitted its exact geometry authority");
	let r = ci(t, n.scaleExponent), i = /* @__PURE__ */ new Set();
	for (let e of n.eventYs) i.add(si(_i(e, n.padBottom), n.scaleExponent)), i.add(si(vi(vi(e, r), n.padTop), n.scaleExponent));
	return Object.freeze([...i].filter(Number.isFinite).sort((e, t) => e - t));
}
function Si(e, t, n, r) {
	let i = Qr.get(e);
	if (!i) throw Error("Compiled polygon omitted its exact geometry authority");
	let a = zr(ci(n, i.scaleExponent), ci(r, i.scaleExponent)), o = ci(t, i.scaleExponent), s = vi(a, i.padBottom), c = _i(o, i.padTop), l = _i(a, c), u = G(i.polygonTop, s) >= 0 ? i.polygonTop : s, d = G(i.polygonBottom, l) <= 0 ? i.polygonBottom : l, f = [], p = [];
	di(i.spanIndex, u, d, p);
	for (let e of p) {
		let t = G(u, e.yTop) >= 0 ? u : e.yTop;
		if (G(G(d, e.yBottom) <= 0 ? d : e.yBottom, t) <= 0) continue;
		let n = i.edges[e.leftEdge], r = i.edges[e.rightEdge];
		if (hi(n, r)) continue;
		let a = G(s, e.yTop) > 0, o = G(l, e.yBottom) < 0, p = (e, t, n, r) => {
			let a = t ? n : r, o = {
				numerator: e.dx * a.numerator - e.c * a.denominator,
				denominator: e.dy * a.denominator
			};
			return {
				slope: t ? {
					numerator: e.dx,
					denominator: e.dy
				} : {
					numerator: 0n,
					denominator: 1n
				},
				intercept: i.scaleExponent >= 0 ? {
					numerator: o.numerator << BigInt(i.scaleExponent),
					denominator: o.denominator
				} : {
					numerator: o.numerator,
					denominator: o.denominator << BigInt(-i.scaleExponent)
				}
			};
		}, m = p(n, a, {
			numerator: -i.padBottom.numerator,
			denominator: i.padBottom.denominator
		}, e.yTop), h = p(n, o, c, e.yBottom), g = p(r, a, {
			numerator: -i.padBottom.numerator,
			denominator: i.padBottom.denominator
		}, e.yTop), _ = p(r, o, c, e.yBottom), v = n.dx >= 0n ? m : h, y = r.dx >= 0n ? _ : g, b = Object.freeze({
			left: Object.freeze({
				slope: v.slope,
				intercept: vi(v.intercept, i.scaleExponent >= 0 ? {
					numerator: i.padLeft.numerator << BigInt(i.scaleExponent),
					denominator: i.padLeft.denominator
				} : {
					numerator: i.padLeft.numerator,
					denominator: i.padLeft.denominator << BigInt(-i.scaleExponent)
				})
			}),
			right: Object.freeze({
				slope: y.slope,
				intercept: _i(y.intercept, i.scaleExponent >= 0 ? {
					numerator: i.padRight.numerator << BigInt(i.scaleExponent),
					denominator: i.padRight.denominator
				} : {
					numerator: i.padRight.numerator,
					denominator: i.padRight.denominator << BigInt(-i.scaleExponent)
				})
			})
		});
		f.push(b);
	}
	return Object.freeze(f);
}
//#endregion
//#region packages/docx/src/layout/axis-aligned-overlap.ts
function Ci(e, t, n) {
	return e.left < t.right - n && e.right > t.left + n && e.top < t.bottom - n && e.bottom > t.top + n;
}
function wi(e, t, n) {
	let r = e.right - e.left, i = e.bottom - e.top;
	if (r < 0 || i < 0) throw RangeError("Overlap rectangle has negative extent");
	let a = e.left, o = e.top;
	for (let e = 0; e <= t.length; e += 1) {
		let s = {
			left: a,
			right: a + r,
			top: o,
			bottom: o + i
		}, c = t.map((e) => ({
			left: e.left,
			right: e.right,
			top: e.top,
			bottom: e.bottom
		})).filter((e) => Ci(s, e, n.overlapEpsilon));
		if (c.length === 0) return Object.freeze({
			left: a,
			top: o
		});
		if (e === t.length) throw Error("Axis-aligned overlap resolution did not converge");
		let l = Math.max(...c.map((e) => e.right));
		if (l + r <= n.rightBoundary + n.rightBoundarySlack) {
			a = l;
			continue;
		}
		o = Math.max(...c.map((e) => e.bottom));
	}
	throw Error("Axis-aligned overlap resolution did not converge");
}
//#endregion
//#region packages/docx/src/layout/compatibility.ts
function Ti(e, t) {
	if (e.trim() === "") throw Error(`CompatibilityRule.${t} must not be empty`);
}
function K(e) {
	if (Ti(e.id, "id"), Ti(e.description, "description"), !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id)) throw Error("CompatibilityRule.id must be a stable kebab-case identifier");
	if (e.evidence.kind === "microsoft-note") {
		if (Ti(e.evidence.reference, "evidence.reference"), !/^\[MS-[A-Z0-9]+\] §§?\d/.test(e.evidence.reference)) throw Error("CompatibilityRule.evidence.reference must identify a Microsoft specification section");
	} else if (e.evidence.kind === "regression-test") {
		if (Ti(e.evidence.reference, "evidence.reference"), !/^packages\/docx\/src\/.+\.(?:test|spec)\.tsx?#[^#]+$/.test(e.evidence.reference)) throw Error("CompatibilityRule.evidence.reference must use DOCX path#test-title");
	} else if (Ti(e.evidence.syntheticFixtureId, "evidence.syntheticFixtureId"), Ti(e.evidence.application, "evidence.application"), Ti(e.evidence.version, "evidence.version"), Ti(e.evidence.platform, "evidence.platform"), !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.evidence.syntheticFixtureId)) throw Error("CompatibilityRule.evidence.syntheticFixtureId must be kebab-case");
	return Object.freeze(e.evidence), Object.freeze(e);
}
K({
	id: "word-section-btlr-tbrl-page-frame",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/coordinate-space.test.ts#maps Transitional text direction %s to %s"
	},
	description: "Issue #988 comment 4950296007 records that, unlike the normative ECMA-376 Part 4 §14.11.7 equivalence to lr, Word uses the tbRl page frame for section-level btLr; this rule covers only the page frame, while glyph orientation is paint-owned."
}), K({
	id: "word-square-line-start-one-inch",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/float-line-start-one-inch.test.ts#(e) the boundary is identical across scales (absolute pt width)"
	},
	description: "Issue #676 records that Word starts a content line beside a square-wrapped object only when the free side gap is at least one inch; tight and through polygon openings and empty paragraph marks are outside this rule."
});
var Ei = K({
	id: "word-float-different-paragraph-displacement",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/floats.test.ts#keeps observed different-paragraph displacement on exclusion bounds"
	},
	description: "Preserve the established Word-compatible policy that an overlap-permitted float is displaced by exclusion geometry from floats anchored in other paragraphs, while same-paragraph floats may overlap."
}), Di = K({
	id: "word-page-anchored-table-collision-deferral",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/float-table-page-fit.test.ts#(g) DEFERS a page-anchored floating table when its raw band intersects an existing table float"
	},
	description: "Preserve the established Word-compatible pagination behavior that defers an absolute page- or margin-anchored floating table when its authored object band intersects an existing floating-table text-exclusion band on the page."
});
K({
	id: "word-empty-mark-float-side-gap",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/float-line-start-one-inch.test.ts#keeps an anchor-host metric-only line on the paragraph-mark threshold"
	},
	description: "An empty or anchor-only paragraph-mark line may start beside a square-wrapped object when the available side gap can hold the paragraph mark em; the one-inch content-line threshold does not apply."
});
var Oi = .05;
function ki(e) {
	return (72 - Oi) * e;
}
function Ai(e, t) {
	return e * t;
}
//#endregion
//#region packages/docx/src/layout/floats.ts
var ji = .01, Mi = .5;
function Ni(e, t) {
	return Object.freeze(e === "overlap" ? {
		kind: "word-different-paragraph",
		paragraphId: t
	} : { kind: "none" });
}
function Pi(e, t) {
	return Object.freeze(e ? {
		kind: "word-different-paragraph",
		paragraphId: t
	} : { kind: "drawingml-normative" });
}
function Fi(e) {
	let t = {
		occurrenceId: e.occurrenceId,
		paragraphId: e.paragraphId,
		bounds: e.bounds,
		exclusionBounds: e.exclusionBounds
	};
	return e.kind === "table" ? {
		...t,
		kind: "table",
		tableOverlap: e.overlap
	} : {
		...t,
		kind: e.kind === "shape" ? "drawingml" : "frame"
	};
}
function Ii(e, t) {
	let n = e.imageX, r = e.imageY, i = e.imageW, a = e.imageH, o = e.xLeft, s = e.xRight, c = e.yTop, l = e.yBottom, u = {
		occurrenceId: e.anchorOccurrenceId ?? e.acquisitionOccurrenceId ?? `display-float:${t}`,
		paragraphId: e.paraId,
		bounds: {
			xPt: n,
			yPt: r,
			widthPt: i,
			heightPt: a
		},
		exclusionBounds: {
			xPt: o,
			yPt: c,
			widthPt: s - o,
			heightPt: l - c
		}
	};
	return e.kind === "table" ? {
		...u,
		kind: "table",
		tableOverlap: e.tableOverlap
	} : {
		...u,
		kind: e.kind === "shape" ? "drawingml" : "frame"
	};
}
function Li(e) {
	let t = e.xPt, n = e.yPt, r = e.widthPt, i = e.heightPt;
	return {
		left: t,
		right: t + r,
		top: n,
		bottom: n + i
	};
}
function Ri(e, t, n) {
	return t === 0 && n === 0 ? e : Object.freeze({
		xPt: e.xPt + t,
		yPt: e.yPt + n,
		widthPt: e.widthPt,
		heightPt: e.heightPt
	});
}
function zi(e, t, n, r) {
	return Object.freeze({
		bounds: Ri(e.bounds, t, n),
		exclusionBounds: Ri(e.exclusionBounds, t, n),
		displacement: Object.freeze({
			xPt: t,
			yPt: n
		}),
		appliedCompatibilityRuleIds: Object.freeze([...r])
	});
}
function Bi(e, t) {
	let n = e.bounds.xPt - e.exclusionBounds.xPt, r = e.bounds.yPt - e.exclusionBounds.yPt, i = e.exclusionBounds.xPt + e.exclusionBounds.widthPt - e.bounds.xPt - e.bounds.widthPt, a = e.exclusionBounds.yPt + e.exclusionBounds.heightPt - e.bounds.yPt - e.bounds.heightPt, o = Li(t.exclusionBounds);
	return {
		left: o.left - i,
		right: o.right + n,
		top: o.top - a,
		bottom: o.bottom + r
	};
}
function Vi(e, t, n = e.rightBoundaryPt) {
	let r = Li(e.moving.bounds);
	return t.length === 0 ? Object.freeze({
		left: r.left,
		top: r.top
	}) : wi(r, t, {
		overlapEpsilon: e.overlapEpsilonPt ?? 0,
		rightBoundary: n,
		rightBoundarySlack: e.rightBoundarySlackPt ?? 0
	});
}
function Hi(e) {
	let { moving: t, avoidance: n } = e, r = e.blockers.flatMap((e) => t.kind === "table" && e.kind === "table" && (t.tableOverlap === "never" || e.tableOverlap === "never") || n.kind === "drawingml-normative" && e.kind === "drawingml" ? [Li(e.bounds)] : []), i = n.kind === "word-different-paragraph" ? e.blockers.flatMap((e) => e.paragraphId === n.paragraphId ? [] : [Bi(t, e)]) : [], a = t.exclusionBounds.xPt + t.exclusionBounds.widthPt - t.bounds.xPt - t.bounds.widthPt, o = n.kind === "word-different-paragraph" ? e.rightBoundaryPt - a : e.rightBoundaryPt, s = Vi(e, r, o), c = i.length === 0 ? s : Vi(e, [...r, ...i], o);
	return zi(t, c.left - t.bounds.xPt, c.top - t.bounds.yPt, c.left !== s.left || c.top !== s.top ? [Ei.id] : []);
}
function Ui(e) {
	if (e.inlineEndPt < e.inlineStartPt || e.blockExtentPt < 0) throw RangeError("Block-flow admission received a negative extent");
	let t = e.blockers.filter((t) => {
		let n = t.exclusionBounds;
		return t.kind === "table" && e.inlineEndPt - n.xPt > e.overlapEpsilonPt && n.xPt + n.widthPt - e.inlineStartPt > e.overlapEpsilonPt;
	}), n = e.blockStartPt;
	for (let r = 0; r <= t.length; r += 1) {
		let i = t.filter((t) => {
			let r = t.exclusionBounds;
			return n + e.blockExtentPt - r.yPt > e.overlapEpsilonPt && r.yPt + r.heightPt - n > e.overlapEpsilonPt;
		});
		if (i.length === 0) return Object.freeze({ blockStartPt: n });
		if (r === t.length) throw Error("Block-flow float admission did not converge");
		n = Math.max(...i.map((e) => e.exclusionBounds.yPt + e.exclusionBounds.heightPt));
	}
	throw Error("Block-flow float admission did not converge");
}
function Wi(e) {
	let t = Li(e.bounds), n = e.blockers.some((n) => n.kind === "table" && Ci(t, Li(n.exclusionBounds), e.overlapEpsilonPt));
	return Object.freeze({
		defer: n,
		appliedCompatibilityRuleIds: Object.freeze(n ? [Di.id] : [])
	});
}
//#endregion
//#region packages/docx/src/layout/float-wrap.ts
function q(e) {
	let t = Hr(e);
	return t.exponent >= 0 ? {
		numerator: t.coefficient << BigInt(t.exponent),
		denominator: 1n
	} : {
		numerator: t.coefficient,
		denominator: 1n << BigInt(-t.exponent)
	};
}
function Gi(e, t) {
	return {
		numerator: e.numerator * t.denominator + t.numerator * e.denominator,
		denominator: e.denominator * t.denominator
	};
}
function Ki(e, t) {
	return {
		numerator: e.numerator * t.denominator - t.numerator * e.denominator,
		denominator: e.denominator * t.denominator
	};
}
function qi(e, t) {
	return {
		numerator: e.numerator * t.numerator,
		denominator: e.denominator * t.denominator
	};
}
function Ji(e, t) {
	let n = t.numerator < 0n;
	return {
		numerator: (n ? -e.numerator : e.numerator) * t.denominator,
		denominator: e.denominator * (n ? -t.numerator : t.numerator)
	};
}
function Yi(e, t) {
	let n = q(e), r = q(t);
	return qr({
		numerator: n.numerator * r.denominator + r.numerator * n.denominator,
		denominator: 2n * n.denominator * r.denominator
	});
}
function Xi(e) {
	switch (e) {
		case "left":
		case "right":
		case "largest":
		case "bothSides": return e;
		default: return "bothSides";
	}
}
function Zi(e) {
	return e === "square" || e === "topAndBottom" || e === "tight" || e === "through";
}
function Qi(e, t, n) {
	return e.xRight > t + .01 && e.xLeft < n - .01;
}
var $i = /* @__PURE__ */ new WeakMap(), ea = 4, ta = /* @__PURE__ */ new WeakMap();
function na(e) {
	return Object.isFrozen(e) && e.every((e) => Object.isFrozen(e));
}
function ra(e, t, n, r, i, a) {
	return e.kind === t && Object.is(e.xLeftPt, n) && Object.is(e.xRightPt, r) && Object.is(e.yTopPt, i) && Object.is(e.yBottomPt, a);
}
function ia(e, t, n) {
	let r = e.authoredWrap;
	if (r !== "tight" && r !== "through") throw Error("Polygon compilation requires tight or through wrap");
	let i = {
		kind: r,
		imageKey: e.imageKey,
		points: e.wrapPolygon,
		xLeftPt: e.xLeft,
		xRightPt: e.xRight,
		yTopPt: e.yTop,
		yBottomPt: e.yBottom
	};
	Zr(i);
	let a = na(t);
	if (a) {
		let i = ta.get(t)?.find((t) => ra(t, r, e.xLeft, e.xRight, e.yTop, e.yBottom));
		if (i) return n && (n.polygonCacheHitCount += 1), i.compiled;
	}
	n && (n.polygonCompileCount += 1);
	let o = pi(i);
	if (a) {
		let n = Object.freeze({
			kind: r,
			xLeftPt: e.xLeft,
			xRightPt: e.xRight,
			yTopPt: e.yTop,
			yBottomPt: e.yBottom,
			compiled: o
		});
		ta.set(t, Object.freeze([n, ...(ta.get(t) ?? []).slice(0, ea - 1)]));
	}
	return o;
}
function aa(e, t) {
	let n = e.map((e) => {
		let n = e.wrapPolygon;
		t && n && (t.polygonSnapshotPointCount += n.length);
		let r = Object.freeze({
			...e,
			...n ? { wrapPolygon: Object.freeze(n.map((e) => Object.freeze({ ...e }))) } : {}
		}), i = r.authoredWrap === "tight" || r.authoredWrap === "through" ? ia(r, n ?? [], t) : null;
		return Object.freeze({
			rect: r,
			polygon: i,
			wrapMaximumLeftPt: i ? Math.min(r.xLeft, i.polygonLeftPt) : r.xLeft,
			wrapMaximumRightPt: i ? Math.max(r.xRight, i.polygonRightPt) : r.xRight
		});
	}), r = Object.freeze({ floats: Object.freeze(n) });
	return $i.set(r, /* @__PURE__ */ new Map()), r;
}
function oa(e, t) {
	let n = Xi(e.rect.side);
	if (n !== "largest") return n;
	let r = G(Ki(q(e.wrapMaximumLeftPt), q(t.xLeftPt)), Ki(q(t.xRightPt), q(e.wrapMaximumRightPt)));
	return r === 0 ? t.readingDirection === "ltr" ? "left" : "right" : r > 0 ? "left" : "right";
}
function sa(e, t, n, r, i, a) {
	let { rect: o, polygon: s } = e, c = s ? bi(s, t, n) : [{
		l: q(o.xLeft),
		r: q(o.xRight)
	}];
	if (c.length === 0) return [];
	let l = s === null, u = c.reduce((e, t) => G(t.l, e) < 0 ? t.l : e, c[0].l), d = c.reduce((e, t) => G(t.r, e) > 0 ? t.r : e, c[0].r);
	switch (oa(e, a)) {
		case "left": return [{
			l: u,
			r: q(i),
			leftSquareBoundary: l,
			rightSquareBoundary: !1
		}];
		case "right": return [{
			l: q(r),
			r: d,
			leftSquareBoundary: !1,
			rightSquareBoundary: l
		}];
		case "bothSides": return c.map((e) => ({
			...e,
			leftSquareBoundary: l,
			rightSquareBoundary: l
		}));
	}
}
function ca(e, t) {
	let n = $i.get(t);
	if (!n) throw Error("Prepared float geometry omitted its sweep cache");
	let r = n.get(e);
	if (r) return r;
	let i = /* @__PURE__ */ new Set(), a = (e) => {
		Number.isFinite(e) && i.add(e);
	};
	for (let { rect: n, polygon: r } of t.floats) if (a(Yr(Ki(q(n.yTop), q(e)))), a(n.yBottom), r) for (let t of xi(r, e)) a(t);
	let o = Object.freeze([...i].sort((e, t) => e - t));
	return n.set(e, o), o;
}
function la(e) {
	let t = e.filter((e) => G(e.r, e.l) > 0).slice().sort((e, t) => G(e.l, t.l) || G(e.r, t.r)), n = [];
	for (let e of t) {
		let t = n.at(-1);
		if (!t || G(e.l, t.r) > 0) {
			n.push({ ...e });
			continue;
		}
		G(e.l, t.l) === 0 && (t.leftSquareBoundary = t.leftSquareBoundary && e.leftSquareBoundary);
		let r = G(e.r, t.r);
		r > 0 ? (t.r = e.r, t.rightSquareBoundary = e.rightSquareBoundary) : r === 0 && (t.rightSquareBoundary = t.rightSquareBoundary && e.rightSquareBoundary);
	}
	return n;
}
function ua(e, t, n, r, i) {
	let a = la(e), o = q(t), s = q(n), c = [], l = (e, t, n) => {
		let r = G(o, e) >= 0 ? o : e, i = G(s, t) <= 0 ? s : t;
		G(i, r) > 0 && c.push({
			l: r,
			r: i,
			squareConstrained: n
		});
	}, u = o, d = !1;
	for (let e of a) {
		if (G(e.r, o) <= 0) {
			d = e.rightSquareBoundary;
			continue;
		}
		if (G(e.l, s) >= 0) {
			l(u, s, d), u = s;
			break;
		}
		G(e.l, u) > 0 && l(u, e.l, d || e.leftSquareBoundary);
		let t = G(e.r, u);
		if (t > 0 ? (u = e.r, d = e.rightSquareBoundary) : t === 0 && (d &&= e.rightSquareBoundary), G(u, s) >= 0) break;
	}
	G(u, s) < 0 && l(u, s, d);
	let f = {
		numerator: 0n,
		denominator: 1n
	};
	for (let e of c) {
		let t = Ki(e.r, e.l);
		G(t, f) > 0 && (f = t);
	}
	for (let e of c) {
		let t = Ki(e.r, e.l);
		if (G(t, f) === 0 && G(t, q(Math.max(1, e.squareConstrained ? i : r))) >= 0) return {
			l: e.l,
			r: e.r,
			squareConstrained: e.squareConstrained
		};
	}
	return null;
}
function da(e, t, n, r, i, a, o, s, c, l, u) {
	let d = q(e), f = Gi(d, q(t)), p = (e) => q(e);
	if (a.floats.some(({ rect: e }) => e.mode === "topAndBottom" && Qi(e, o, s) && G(f, p(e.yTop)) > 0 && G(d, p(e.yBottom)) < 0)) return null;
	let m = [];
	for (let i of a.floats) {
		let { rect: a } = i;
		if (a.mode !== "square" || G(f, p(a.yTop)) <= 0 || G(d, p(a.yBottom)) >= 0 || !Qi(a, n, r)) continue;
		let o = sa(i, e, t, n, r, c);
		o.length !== 0 && m.push(...o);
	}
	if (m.length === 0) return {
		topY: e,
		xOffset: 0,
		maxWidth: i
	};
	let h = ua(m, n, r, l, u);
	if (!h) return null;
	let g = {
		numerator: 0n,
		denominator: 1n
	}, _ = Ki(h.l, q(n)), v = G(_, g) > 0 ? _ : g, y = q(n), b = Yr(v), x = n + b, S = q(x);
	if (G(S, h.l) < 0 && (b = Yr(Ki(q(Yr(h.l)), y)), x = n + b, S = q(x)), G(S, h.l) < 0) throw Error("Exact float window could not represent a contained start");
	let C = q(r), w = G(h.r, C) <= 0 ? h.r : C, T = Ki(q(Xr(w)), S), E = Xr(G(T, g) > 0 ? T : g);
	if (G(q(x + E), w) > 0) throw Error("Exact float window could not represent a contained end");
	return {
		topY: e,
		xOffset: b,
		maxWidth: E
	};
}
function fa(e, t) {
	return Gi(qi(e.exact.slope, q(t)), e.exact.intercept);
}
function pa(e, t) {
	return G(e.exact.slope, t.exact.slope) === 0 && G(e.exact.intercept, t.exact.intercept) === 0;
}
function ma(e, t, n) {
	return G(fa(e, n), fa(t, n)) || G(e.exact.slope, t.exact.slope);
}
function ha(e, t, n) {
	let r = Ki(e.slope, t.slope);
	if (r.numerator === 0n) return null;
	let i = Ki(e.intercept, t.intercept);
	return Ji(Ki(q(n), i), r);
}
function ga(e, t, n, r, i) {
	t === null || G(t, q(n)) <= 0 || G(t, q(r)) >= 0 || (e.push(Yr(t)), i && (i.localRootCandidateCount += 1));
}
function _a(e, t, n, r, i, a) {
	let o = e[0];
	for (let r of e.slice(1)) {
		let e = ma(r, o, n);
		(t === "min" && e < 0 || t === "max" && e > 0) && (o = r);
	}
	let s = o.square;
	for (let c of e) if (c !== o) {
		if (pa(c, o)) {
			s &&= c.square;
			continue;
		}
		(t === "min" ? G(c.exact.slope, o.exact.slope) < 0 : G(c.exact.slope, o.exact.slope) > 0) && ga(i, ha(c.exact, o.exact, 0), n, r, a);
	}
	return {
		exact: o.exact,
		square: s
	};
}
function va(e, t = !1) {
	return {
		exact: {
			slope: {
				numerator: 0n,
				denominator: 1n
			},
			intercept: q(e)
		},
		square: t
	};
}
function ya(e, t, n, r, i, a, o, s, c) {
	let { rect: l, polygon: u } = e, d = q(Yi(n, r));
	if (G(Gi(d, q(t)), q(l.yTop)) <= 0 || G(d, q(l.yBottom)) >= 0) return [];
	let f = u ? Si(u, t, n, r).map((e) => ({
		left: {
			exact: e.left,
			square: !1
		},
		right: {
			exact: e.right,
			square: !1
		}
	})) : [{
		left: va(l.xLeft, !0),
		right: va(l.xRight, !0)
	}];
	if (f.length === 0) return [];
	let p = _a(f.map((e) => e.left), "min", n, r, s, c), m = _a(f.map((e) => e.right), "max", n, r, s, c);
	switch (u?.kind === "tight" && (f = [{
		left: p,
		right: m
	}]), oa(e, o)) {
		case "left": return [{
			left: p,
			right: va(a)
		}];
		case "right": return [{
			left: va(i),
			right: m
		}];
		case "bothSides": return f;
	}
}
function ba(e, t, n, r, i) {
	let a = e.slice().sort((e, n) => ma(e.left, n.left, t) || ma(e.right, n.right, t));
	for (let e = 0; e + 1 < a.length; e += 1) ga(r, ha(a[e].left.exact, a[e + 1].left.exact, 0), t, n, i);
	let o = [];
	for (let e of a) {
		let a = o.at(-1);
		if (!a) {
			o.push(e);
			continue;
		}
		if (ga(r, ha(e.left.exact, a.right.exact, 0), t, n, i), ma(e.left, a.right, t) > 0) {
			o.push(e);
			continue;
		}
		let s = _a([a.right, e.right], "max", t, n, r, i), c = pa(a.left, e.left) ? {
			exact: a.left.exact,
			square: a.left.square && e.left.square
		} : a.left;
		o[o.length - 1] = {
			left: c,
			right: s
		};
	}
	return o;
}
function xa(e, t, n, r, i, a, o, s, c, l, u, d) {
	let f = q(Yi(e, t)), p = Gi(f, q(n));
	if (a.floats.some(({ rect: e }) => e.mode === "topAndBottom" && Qi(e, o, s) && G(p, q(e.yTop)) > 0 && G(f, q(e.yBottom)) < 0)) return null;
	let m = [], h = [];
	for (let o of a.floats) {
		let { rect: a } = o;
		a.mode === "square" && Qi(a, r, i) && h.push(...ya(o, n, e, t, r, i, c, m, d));
	}
	if (h.length === 0) return null;
	let g = ba(h, e, t, m, d), _ = va(r), v = va(i), y = [], b = (n, r, i) => {
		let a = {
			slope: Ki(r.exact.slope, n.exact.slope),
			intercept: Ki(r.exact.intercept, n.exact.intercept)
		};
		y.push({ exactWidth: a });
		let o = Math.max(1, i ? u : l);
		G(Gi(qi(a.slope, q(e)), a.intercept), q(o)) < 0 && a.slope.numerator > 0n && ga(m, ha(r.exact, n.exact, o), e, t, d);
	}, x = _;
	for (let e of g) b(x, e.left, x.square || e.left.square), x = e.right;
	b(x, v, x.square);
	let S = y[0];
	for (let t of y.slice(1)) (G(Gi(qi(t.exactWidth.slope, q(e)), t.exactWidth.intercept), Gi(qi(S.exactWidth.slope, q(e)), S.exactWidth.intercept)) || G(t.exactWidth.slope, S.exactWidth.slope)) > 0 && (S = t);
	if (S) for (let n of y) n === S || G(n.exactWidth.slope, S.exactWidth.slope) <= 0 || ga(m, ha(n.exactWidth, S.exactWidth, 0), e, t, d);
	return m.length === 0 ? null : Math.min(...m);
}
function Sa(e, t, n, r, i, a, o = r, s = r + i, c = {
	xLeftPt: r,
	xRightPt: r + i,
	readingDirection: "ltr"
}, l = t, u = null) {
	let d = r, f = r + i, p = ca(n, a);
	if (u) {
		u.structuralEventCount = p.length;
		for (let { polygon: e } of a.floats) e && (u.compiledIntersectionCount += e.intersectionCount, u.compiledContourSpanCount += e.contourSpans.length, u.compileOrderComparisonCount += e.compileOrderComparisonCount, u.compilePairMembershipVisitCount += e.compilePairMembershipVisitCount);
	}
	let m = (e) => (u && (u.evaluatedYCount += 1), da(e, n, d, f, i, a, o, s, c, t, l)), h = m(e);
	if (h) return h;
	let g = e, _ = p.findIndex((e) => e > g);
	for (; _ >= 0 && _ < p.length;) {
		let e = p[_], r = xa(g, e, n, d, f, a, o, s, c, t, l, u);
		if (r !== null) {
			u && (u.localRootEventCount += 1);
			let e = m(r);
			if (e) return e;
			g = r;
			continue;
		}
		let i = m(e);
		if (i) return i;
		g = e;
		do
			_ += 1;
		while (_ < p.length && p[_] <= g);
	}
	throw Error("Finite float line-window event sweep found no usable terminal Y");
}
function Ca(e, t, n, r, i, a, o = r, s = r + i, c = {
	xLeftPt: r,
	xRightPt: r + i,
	readingDirection: "ltr"
}, l = t) {
	return Sa(e, t, n, r, i, a, o, s, c, l);
}
function wa(e, t, n, r) {
	let i = /* @__PURE__ */ new Set();
	for (;;) {
		let a = e;
		for (let i of t) i.mode === "topAndBottom" && Qi(i, n, r) && e >= i.yTop && e < i.yBottom && (a = Math.max(a, i.yBottom));
		if (a === e) return e;
		if (!Number.isFinite(a) || a < e || i.has(a)) throw Error("Top-and-bottom solver violated strictly increasing finite-bottom progress");
		i.add(a), e = a;
	}
}
//#endregion
//#region packages/docx/src/layout/diagnostics.ts
var Ta = Object.freeze({
	UNSUPPORTED_TEXT_EFFECT: Object.freeze({
		severity: "warning",
		layoutCode: "UNSUPPORTED_FEATURE",
		message: "WordprocessingML text effects are not rendered"
	}),
	INVALID_TEXT_EFFECT_VALUE: Object.freeze({
		severity: "warning",
		layoutCode: "INVALID_VALUE",
		message: "An invalid WordprocessingML text-effect value was ignored"
	}),
	MISSING_DRAWING_EXTENT: Object.freeze({
		severity: "error",
		layoutCode: "INVALID_GEOMETRY",
		message: "A drawing with a missing required extent was omitted"
	}),
	INVALID_DRAWING_EXTENT: Object.freeze({
		severity: "error",
		layoutCode: "INVALID_GEOMETRY",
		message: "A drawing with an invalid extent was omitted"
	}),
	DEGENERATE_DRAWING_EXTENT: Object.freeze({
		severity: "warning",
		layoutCode: "INVALID_GEOMETRY",
		message: "A drawing has a schema-valid zero-area extent"
	})
}), Ea = Object.freeze({
	code: "INVALID_VALUE",
	severity: "warning",
	message: "The parser diagnostic contract did not match this renderer build"
});
function Da(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Oa(e, t) {
	if (!Array.isArray(e) || !e.every((e) => Number.isSafeInteger(e) && e >= 0)) return !1;
	let [n] = e;
	return n === void 0 || n < t;
}
function ka(e) {
	return Object.freeze({
		story: "body",
		storyInstance: "body",
		path: Object.freeze([...e])
	});
}
function Aa(e, t) {
	if (e === void 0) return Object.freeze([]);
	if (!Array.isArray(e)) return Object.freeze([Ea]);
	let n = [], r = !1;
	for (let i of e) {
		if (!Da(i) || typeof i.code != "string" || !Object.hasOwn(Ta, i.code) || i.part !== "word/document.xml" || !Oa(i.path, t)) {
			r = !0;
			continue;
		}
		let e = Ta[i.code];
		if (i.severity !== e.severity) {
			r = !0;
			continue;
		}
		n.push(Object.freeze({
			code: e.layoutCode,
			severity: e.severity,
			source: ka(i.path),
			message: e.message
		}));
	}
	return r && n.push(Ea), Object.freeze(n);
}
var J = class extends Error {
	code;
	constructor(e, t) {
		super(`${e}: ${t}`), this.name = "LayoutInvariantError", this.code = e;
	}
}, ja = class extends J {
	reason;
	states;
	passes;
	constructor(e, t, n) {
		super("NON_CONVERGENCE", e === "cycle" ? `repeated exact-state cycle at ${t.at(-1) ?? "<missing>"}` : `hard exact-state pass limit ${n} reached`), this.name = "ExactConvergenceError", this.reason = e, this.states = Object.freeze([...t]), this.passes = n;
	}
};
function Ma(e) {
	let { seedState: t, step: n, stateOf: r, limit: i } = e, a = t === void 0 ? 2 : 1;
	if (!Number.isInteger(i) || i < a) throw RangeError(`Exact convergence limit must be an integer >= ${a}`);
	let o = t === void 0 ? [] : [t], s = new Set(o), c = null;
	for (let e = 1; e <= i; e += 1) {
		let t = n(c, e), a = r(t), l = o.at(-1);
		if (o.push(a), l === a) return Object.freeze({
			value: t,
			passes: e
		});
		if (s.has(a)) throw new ja("cycle", o, e);
		if (s.add(a), e === i) throw new ja("limit", o, e);
		c = t;
	}
	throw new ja("limit", o, i);
}
function Na(e, t, n) {
	if (!Number.isInteger(n) || n < 1) throw new J("NON_CONVERGENCE", "limit must be a positive integer");
	try {
		return Ma({
			seedState: e.fingerprint,
			step: (n) => t(n ?? e),
			stateOf: (e) => e.fingerprint,
			limit: n
		}).value;
	} catch (e) {
		throw e instanceof ja ? new J("NON_CONVERGENCE", e.reason === "cycle" ? `repeated geometry fingerprint cycle at ${e.states.at(-1) ?? "<missing>"}` : `hard iteration limit ${n} reached`) : e;
	}
}
//#endregion
//#region packages/docx/src/layout/line-wrap-convergence.ts
var Pa = class extends J {
	reason;
	states;
	constructor(e, t) {
		super("NON_CONVERGENCE", e === "cycle" ? `line wrap measure/resolve cycle did not converge (${t.length} states)` : `line wrap measure/resolve pass limit did not converge (${t.length} states)`), this.name = "LineWrapNonConvergenceError", this.reason = e, this.states = Object.freeze([...t]);
	}
};
function Fa(e) {
	return e.map((e) => ({ ...e }));
}
function Ia(e, t) {
	return JSON.stringify(e.map((e, n) => ({
		end: e.consumedEnd,
		topY: e.topY,
		xOffset: e.xOffset,
		availableWidth: e.availWidth,
		probeHeight: t[n],
		segments: e.segments.map((e) => ({
			source: e.src,
			...e.text === void 0 ? {} : { text: e.text }
		}))
	})));
}
var La = 16;
function Ra(e, t) {
	try {
		return Ma({
			step: (n) => {
				let r = e(n?.probeHeights ?? null), i = Object.freeze(r.map(t));
				return Object.freeze({
					lines: r,
					probeHeights: i,
					state: Ia(r, i)
				});
			},
			stateOf: (e) => e.state,
			limit: La
		}).value.lines;
	} catch (e) {
		throw e instanceof ja ? new Pa(e.reason, e.states) : e;
	}
}
K({
	id: "word-east-asian-grid-line-allocation",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/compatibility.test.ts#pins East Asian grid allocation and the untabled Far East metric factor"
	},
	description: "For an East Asian single-spaced line on a document grid, preserve the measured whole-cell allocation from the intended face design height and use the established 1.3-times-em fallback only when that design height is unavailable."
}), K({
	id: "word-use-fe-layout-inherited-grid-minimum",
	evidence: {
		kind: "office-observation",
		syntheticFixtureId: "far-east-hinted-latin-grid-multiple",
		application: "Microsoft Word",
		version: "16.111.1",
		platform: "macOS 26.5.2"
	},
	description: "With useFELayout enabled, a Latin line carrying an eastAsia-hinted run participates in Far East grid metrics; inherited automatic spacing keeps the larger of its whole-cell design allocation and one grid pitch multiplied by the inherited spacing value."
}), K({
	id: "word-use-fe-layout-empty-mark-grid-allocation",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/paragraph-measure.test.ts#applies useFELayout grid-cell allocation to an empty paragraph mark"
	},
	description: "With useFELayout enabled, a content-less paragraph mark participates in Far East whole-cell document-grid allocation even when the document contains no literal East Asian text."
}), K({
	id: "word-contiguous-underline-geometry",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/paragraph.test.ts#uses one safe baseline for a solid underline spanning adjacent source runs"
	},
	description: "Adjacent compatible underlined source runs share one safe baseline and continuous authored cadence while style, color, and thickness boundaries remain distinct."
}), K({
	id: "word-grid-at-least-tall-line-unsnapped",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/line-box-height.test.ts#does not round tall East Asian content up to an additional grid cell"
	},
	description: "An explicitly authored atLeast line on an active document grid keeps the maximum of its natural height, authored minimum, and one pitch instead of rounding tall content to another whole cell."
}), K({
	id: "word-degenerate-line-spacing-single",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-DOC] §2.9.146"
	},
	description: "Preserve a non-collapsing single-line fallback for exact or automatic line spacing at or below zero, consistent with the native LSPD representation."
}), K({
	id: "word-auto-multiple-baseline-pin",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/line-spacing-baseline.test.ts#2.0× keeps the baseline at top + ascent (extra 1.0× leading below, NOT centred)"
	},
	description: "Paint an automatic line-spacing multiplier at or above one with its glyph baseline pinned inside the single design line and place multiplier leading below it; this is draw-only and does not replace the centered trailing-mark pagination metric."
}), K({
	id: "word-mixed-anchor-visible-line-metrics",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/anchor-host-metrics.test.ts#reserves host line height without using its zero-ink box for a visible run baseline"
	},
	description: "A zero-ink drawing anchor host reserves its line and grid height while visible neighboring glyphs retain their own ascent, descent, and design-line baseline."
}), K({
	id: "word-justification-leading-indent-exclusion",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/text-distribute.test.ts#forwards (segs, slack, firstContentSi, lastDrawnSi) positionally"
	},
	description: "Keep leading whitespace used as a first-line text indent fixed while distributing justified-line slack across content in a left-to-right line."
}), K({
	id: "word-justified-candidate-separator-fit",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/justify-shrink-overshoot.test.ts#counts a candidate trailing space when the prospective line will justify"
	},
	description: "On a full paragraph-width line that will be fully justified, include the candidate word separator in its wrap-fit width; lines narrowed by DrawingML wrap exclusions retain collapsible line-end separator fit behavior."
}), K({
	id: "word-overflow-punctuation-language-sets",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OE376] §2.1.56"
	},
	description: "Apply the language-specific punctuation sets documented for Word in [MS-OE376] §2.1.56, and let overflowPunct override kinsoku when both rules affect the same character."
}), K({
	id: "word-full-width-character-spacing-scope",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OE376] §2.1.562"
	},
	description: "Interpret ST_CharacterSpacing as applying whitespace compression to full-width punctuation characters. This rule establishes only which characters are eligible; it does not define a universal compression amount."
}), K({
	id: "word-japanese-punctuation-compression-cell",
	evidence: {
		kind: "office-observation",
		syntheticFixtureId: "japanese-fullwidth-punctuation-compression-cell",
		application: "Microsoft Word",
		version: "16.111.1",
		platform: "macOS 26.5.2"
	},
	description: "In the observed Japanese compatibility fixture, compressed full-width punctuation retains at least half of the ideographic cell measured through the selected font route. Tight adjacent glyph ink can require a larger retained extent to prevent collision. This is an Office-observed compression amount, not a normative interpretation of ST_CharacterSpacing."
}), K({
	id: "word-ms-mincho-empty-east-asian-mark-height",
	evidence: {
		kind: "office-observation",
		syntheticFixtureId: "ms-mincho-empty-east-asian-paragraph-mark",
		application: "Microsoft Word",
		version: "16.111.1",
		platform: "macOS 26.5.2"
	},
	description: "In the observed compatibility fixture, an empty 12-point East-Asian paragraph mark routed to MS Mincho occupies a 15.6-point single-line box. Scope this 1.3-em floor to empty East-Asian paragraph marks; ordinary MS Mincho text lines and Latin marks retain their independently measured metrics."
});
function za(e) {
	let t = Math.max(0, e.punctuationAdvancePt);
	return Math.min(t, Math.max(0, e.punctuationInkEndPt, e.ideographicCellAdvancePt / 2));
}
var Ba = {
	ja: new Set([...",.’”、。」』】），．］｝｡､"]),
	zhHans: new Set([..."!%),.:;>?]}¢°·ˇ’”‰′″℃∶、。〃〉》」』】〗〕〞﹚﹜﹞！＂％＇），．：；？］｝￠"]),
	zhHant: new Set([..."!),.:;?]}’”′、。〉》」』】〕〞﹚﹜﹞！），．：；？］｝"]),
	ko: new Set([..."!%),.:;?]}¢°’”′″℃〉》」』】〕！％），．：；？］｝￠"])
}, Va = new Set([
	...Ba.ja,
	...Ba.zhHans,
	...Ba.zhHant,
	...Ba.ko
]);
function Ha(e, t) {
	let n = t?.toLowerCase();
	return n?.startsWith("ja") ? Ba.ja.has(e) : n?.startsWith("ko") ? Ba.ko.has(e) : n?.startsWith("zh") ? (/(?:^|-)(?:tw|hk|mo)(?:-|$)|hant/u.test(n) ? Ba.zhHant : Ba.zhHans).has(e) : Va.has(e);
}
function Ua(e) {
	return e.lineWillJustify && e.wrapNarrowed !== !0 ? e.widthPx : e.widthPx - e.trailingSpacePx;
}
function Wa(e) {
	return e.resolvedMeasurementRouteCount === 1 ? e.biasBudgetPx : 0;
}
K({
	id: "word-ruby-paragraph-uniform-line-advance",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/paragraph-measure.test.ts#uses one uniform snapped advance for every line in a ruby paragraph"
	},
	description: "Every line in a ruby-bearing paragraph uses the paragraph-wide maximum snapped line advance so its baseline rhythm remains uniform."
}), K({
	id: "word-fit-text-inter-character-expansion",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/fit-text.test.ts#distributes (val − Σnatural)/(n−1) as the inter-character gap, no trailing gap"
	},
	description: "Expand a multi-character fitText region to its authored width by distributing the residual evenly across interior character gaps."
}), K({
	id: "word-cjk-both-inter-character-expansion",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/text-distribute.test.ts#§17.18.44: fills a wrapped pure-CJK line via inter-CJK pitch (expansion default)"
	},
	description: "Treat inter-CJK boundaries as eligible inter-word gaps when expanding a non-final both-justified line that contains no spaces."
}), K({
	id: "word-thai-distribute-cluster-policy",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/thai-distribute.test.ts#fills non-final lines to the right margin under thaiDistribute"
	},
	description: "Expand non-final thaiDistribute lines at Thai grapheme-cluster boundaries while retaining a natural-width final line."
}), K({
	id: "word-numeric-decimal-tab-inference",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/decimal-tab-autoalign.test.ts#right-aligns numbers of different digit counts at the decimal tab"
	},
	description: "Right-align an otherwise tab-less numeric paragraph at its leading decimal tab while leaving non-numeric and no-decimal-tab paragraphs unchanged."
}), K({
	id: "word-numbering-marker-overflow-tab-advance",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/numbered-marker-tab-advance.test.ts#advances the body past the marker to the next tab stop, not onto indentLeft"
	},
	description: "When a numbering marker overruns its hanging-indent budget, advance the body to the next reachable tab stop beyond the marker edge."
}), K({
	id: "word-numbering-suffix-coincident-list-tab",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/numbering-marker.test.ts#keeps a suffix tab on the list stop coincident with the marker end"
	},
	description: "For the tab synthesized by a numbering suffix, accept an authored numeric list tab coincident with the shaped marker end instead of advancing to the next automatic tab stop."
});
function Ga(e, t) {
	return t.alignment === "num" && Math.abs(t.pos - e) <= 1e-6;
}
K({
	id: "word-tab-stop-page-edge-clamp",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/rtl-tab-stops.test.ts#pins a page number to the left text margin when the stop is past it"
	},
	description: "Clamp content assigned to a tab stop beyond the trailing text edge back onto that edge instead of placing ink outside the page content band."
}), K({
	id: "word-dictionary-sea-natural-fit",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/sea-justified-fit.test.ts#Rule 1: wraps the paragraph-final Thai word on a thaiDistribute closing line (zero space-shrink)"
	},
	description: "Do not admit a dictionary Southeast-Asian word by compressing preceding inter-word spaces when its natural advance exceeds the remaining line width."
}), K({
	id: "word-dictionary-sea-atomic-chunk",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/sea-justified-fit.test.ts#Rule 2: a no-space chunk that fits a full line moves whole instead of splitting"
	},
	description: "Move a glued dictionary Southeast-Asian chunk to a fresh line whole when it fits that full line, using dictionary breaks only when the chunk itself is overlong."
}), K({
	id: "word-overlong-token-emergency-break",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/run-inline-formatting.test.ts#breaks a no-space token wider than the line at the character level"
	},
	description: "Emergency-break a non-CJK token that is wider than an empty line at grapheme-safe character boundaries so it remains inside the content band."
}), K({
	id: "word-run-vertical-align-baseline-shift",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/run-char-metrics-render.test.ts#w:vertAlign raises superscript, lowers subscript, and leaves ordinary baselines unchanged"
	},
	description: "Retain the established run-level baseline displacement for vertically aligned text: superscript rises by 0.35 of its authored font size and subscript falls by 0.15, while the separately authored w:position remains additive."
});
function Ka(e, t) {
	return e === "super" ? t * .35 : e === "sub" ? -t * .15 : 0;
}
var qa = 1.3;
function Ja(e, t, n) {
	if (!n || !e) return 0;
	let r = e.trim().toLowerCase();
	return r === "ms mincho" || r === "ｍｓ 明朝" ? t * qa : 0;
}
function Ya(e, t) {
	return t > 0 ? Math.max(1, Math.ceil(e / t)) : 1;
}
function Xa(e, t) {
	return e > 0 ? e : t * qa;
}
function Za(e, t, n) {
	return Math.max(e, t * n);
}
function Qa(e, t, n) {
	return Math.max(e, t, n);
}
function $a(e, t) {
	return (e === "exact" || e === "auto") && t <= 0;
}
K({
	id: "word-neutral-script-attachment",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/compatibility.test.ts#keeps neutral characters attached to the active script slice"
	},
	description: "Weak and neutral non-letter characters stay with the active complex-script slice instead of opening additional formatting segments."
}), K({
	id: "word-rtl-run-ambiguous-class-override",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/bidi-line.test.ts#keeps LTR word order for English text in rtl-marked runs"
	},
	description: "Model an rtl-marked run as a higher-level UAX #9 override for punctuation and symbols only, leaving whitespace and strong letters at their ordinary classes."
}), K({
	id: "word-rtl-complex-script-european-digits-an",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/bidi-line.test.ts#orders an AN-classified date as 2026-02-28"
	},
	description: "Classify European digits as Arabic Number within an Arabic or Hebrew complex-script run so UAX #9 preserves the compatible visual ordering of digit groups and separators."
}), K({
	id: "word-kashida-final-form-priority",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/kashida-priority.test.ts#uses the BaRa join (Beh->Yeh) over the final-letter join in بين"
	},
	description: "Apply the measured kashida final-letter priority classes only at a word-final following letter instead of copying the broader Qt final-form conditions."
}), K({
	id: "word-vertical-tu-corner-placement",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/vertical-text.test.ts#does NOT ink-centre a substituted Tu comma even when ink metrics are present"
	},
	description: "Keep a substituted vertical Tu comma or full stop at the font-designed upper-right cell position rather than ink-centering it geometrically."
});
var eo = /[\p{P}\p{S}]/u;
function to(e) {
	return eo.test(e);
}
function no(e, t) {
	return e === t;
}
function ro(e) {
	return e !== null;
}
//#endregion
//#region packages/docx/src/line-layout.ts
function io(e, t, n, r, i, a = {}) {
	if (t != null) return t * n;
	if (!r?.ruby || !i) throw Error(`Ruby at ${e}pt without hpsRaise requires retained base and guide ink`);
	if (r.textLayoutService && r.textShapeRequest) {
		let e = r.textLayoutService.shape({
			...r.textShapeRequest,
			text: r.text,
			fontSizePt: Sr(r, n),
			measure: !0,
			clusterGeometry: !1
		}), t = r.textLayoutService.shape({
			...r.textShapeRequest,
			text: r.ruby.text,
			fontSizePt: r.ruby.fontSizePt * n,
			measure: !0,
			clusterGeometry: !1
		});
		if (e.inkBounds && t.inkBounds) return e.inkBounds.ascentPt + t.inkBounds.descentPt;
	}
	let o = i.font;
	try {
		i.font = vo(r.bold, r.italic, Sr(r, n), r.fontFamily, a, r.fontRoute);
		let t = i.measureText(r.text);
		i.font = vo(r.bold, r.italic, e * n, r.fontFamily, a, r.fontRoute);
		let o = i.measureText(r.ruby.text);
		if (Number.isFinite(t.actualBoundingBoxAscent) && Number.isFinite(o.actualBoundingBoxDescent)) return t.actualBoundingBoxAscent + o.actualBoundingBoxDescent;
	} finally {
		i.font = o;
	}
	throw Error("Ruby without hpsRaise requires retained base and guide ink");
}
var ao = new Set([
	"sakkal majalla",
	"traditional arabic",
	"simplified arabic",
	"arabic typesetting",
	"univers next arabic",
	"noto naskh arabic",
	"noto sans arabic"
]), oo = new Set([
	"sakkal majalla",
	"traditional arabic",
	"simplified arabic",
	"arabic typesetting",
	"noto naskh arabic"
]);
function so(e) {
	return ao.has(e.toLowerCase());
}
function co(e) {
	return e.map((e) => `"${e}"`).join(", ");
}
var lo = ["Noto Naskh Arabic", "Noto Sans Arabic"];
function uo(e) {
	let t = e && e !== "jp" ? f(e, "sans") : [
		"Noto Sans JP",
		"Hiragino Sans",
		"Meiryo",
		...f("jp", "sans").slice(1)
	];
	return e == null ? `${co([
		...S,
		"Arial",
		"Helvetica",
		"Liberation Sans",
		...t,
		...lo
	])}, sans-serif` : `${co([
		...t,
		...lo,
		...S
	])}, sans-serif`;
}
function fo(e) {
	let t = e && e !== "jp" ? f(e, "serif") : [
		"Yu Mincho",
		"YuMincho",
		"Hiragino Mincho ProN",
		"MS Mincho",
		"Noto Serif JP",
		...f("jp", "serif").slice(1)
	];
	return e == null ? `${co([
		...T,
		"Times New Roman",
		"Cambria",
		"Liberation Serif",
		...t,
		...lo
	])}, serif` : `${co([
		...t,
		...lo,
		...T
	])}, serif`;
}
var po = /* @__PURE__ */ new WeakMap(), mo = /* @__PURE__ */ new WeakMap();
function ho(e, t) {
	let n = e ?? {};
	return t && Object.keys(t).length > 0 && mo.set(n, t), n;
}
function go(e, t = {}) {
	let n = po.get(t) ?? (() => {
		let e = /* @__PURE__ */ new Map();
		return po.set(t, e), e;
	})(), r = e ?? "\0null", i = n.get(r);
	if (i !== void 0) return i;
	let a = _o(e, t, mo.get(t));
	return n.set(r, a), a;
}
function _o(e, t, n = {}) {
	if (!e) return uo(null);
	let r = `"${((e) => e.replace(/"/g, "\\\""))(e)}"`, i = e.toLowerCase(), a = v(e);
	if (so(e)) return oo.has(i) ? `${r}, "Noto Naskh Arabic", "Noto Sans Arabic", "Noto Serif", "Noto Sans JP", "Hiragino Sans", serif` : `${r}, "Noto Sans Arabic", "Noto Naskh Arabic", "Noto Sans JP", "Hiragino Sans", sans-serif`;
	let o = t[e];
	if (o && o !== "auto") switch (o) {
		case "roman": return `${r}, ${fo(a)}`;
		case "swiss": return `${r}, ${uo(a)}`;
		case "modern":
			if (n[e] === "fixed") return `${r}, "Courier New", monospace`;
			break;
		default: break;
	}
	let s = D(e);
	if (s === "serif") return `${r}, ${fo(a)}`;
	if (s === "mono") return `${r}, "Courier New", monospace`;
	if (a == null || a === "jp") {
		if (i.includes("meiryo") || e.includes("メイリオ")) return `${r}, "Meiryo UI", "Meiryo", ${uo(a)}`;
		if (e.includes("游ゴシック") || /\byu\s*gothic\b/i.test(e) || i.includes("yugothic")) return `${r}, "Yu Gothic", "YuGothic", ${uo(a)}`;
		if (i.includes("ipa")) return `${r}, "IPAexGothic", ${uo(a)}`;
		if (i.includes("segoe")) return `${r}, "Segoe UI", ${co([...lo, ...S])}, sans-serif`;
	}
	return `${r}, ${uo(a)}`;
}
function vo(e, t, n, r, i = {}, a) {
	return a ? at(a, n, e ? 700 : 400, t ? "italic" : "normal") : `${t ? "italic" : "normal"} ${e ? "bold" : "normal"} ${n}px ${go(r, i)}`;
}
function yo(e, t, n = !1) {
	return Math.max(R(e.fontFamily, t, n), (e.resolvedLineHeightRatio ?? 0) * t);
}
function bo(e, t, n = !1) {
	return Math.max(R(e.eaFloorFamily, t, n), (e.resolvedEaFloorLineHeightRatio ?? 0) * t);
}
function xo(e) {
	for (let t of e.runs) if (t.type === "text" || t.type === "field") return t.fontSize;
	return typeof e.defaultFontSize == "number" ? e.defaultFontSize : 10;
}
function So(e, t = !1) {
	for (let t of e.runs) if (t.type === "text" || t.type === "field") return t.fontFamily;
	return t && e.defaultFontFamilyEastAsia ? e.defaultFontFamilyEastAsia : e.defaultFontFamily ?? null;
}
function Co(e, t, n) {
	return R(So(e, n), xo(e) * t, n);
}
function wo(e) {
	let t = 0;
	for (let n of e) Cr.test(n) && t++;
	return t;
}
function To(e, t) {
	if (t === 0 || e.length === 0) return 0;
	let n = [...e];
	return wo(e) === n.length ? n.length * t : 0;
}
function Eo(e, t) {
	return e.snapToCharacterGrid === !1 ? 0 : t;
}
function Do(e, t) {
	return e.fitTextPerGapPx === void 0 ? Oo(e) * t : e.fitTextPerGapPx;
}
function Oo(e) {
	return e.charSpacing ?? 0;
}
function ko(e) {
	return e.punctuationCompressions?.reduce((e, t) => e + t.adjustmentPt, 0) ?? 0;
}
function Ao(e, t, n) {
	let r = e.punctuationCompressions?.filter((e) => e.end > t && e.end <= n).map((e) => Object.freeze({
		end: e.end - t,
		adjustmentPt: e.adjustmentPt
	}));
	return r && r.length > 0 ? Object.freeze(r) : void 0;
}
function jo(e, t) {
	if (!e.textLayoutService || !e.textShapeRequest || t.length === 0) return;
	let n = e.textLayoutService.shape({
		...e.textShapeRequest,
		text: t,
		measure: !0,
		clusterGeometry: !1
	});
	if (n.horizontalInkBoundsAreTight !== !0 || !n.inkBounds || !Number.isFinite(n.advancePt) || !Number.isFinite(n.inkBounds.xMinPt) || !Number.isFinite(n.inkBounds.xMaxPt)) return;
	let r = e.charScale ?? 1;
	return {
		advancePt: n.advancePt * r,
		xMinPt: n.inkBounds.xMinPt * r,
		xMaxPt: n.inkBounds.xMaxPt * r
	};
}
function Mo(e) {
	let t, n = /* @__PURE__ */ new Map();
	for (let r of e) {
		if (!("text" in r) || r.verticalRun) {
			t = void 0;
			continue;
		}
		let e = r, a = e.punctuationCompressions ?? [], o = new Map(a.map((e, t) => [e.end, t])), s = [
			0,
			...i(e.text),
			e.text.length
		];
		for (let r = 0; r < s.length - 1; r += 1) {
			let i = s[r], a = s[r + 1];
			if (a <= i) continue;
			let c = o.get(a), l = t || c !== void 0 ? jo(e, e.text.slice(i, a)) : void 0;
			if (t && l) {
				let e = n.get(t.segment) ?? t.segment.punctuationCompressions.map((e) => ({ ...e })), r = e[t.compressionIndex], i = Math.min(0, t.ink.xMaxPt - l.xMinPt - t.ink.advancePt), a = Math.max(r.adjustmentPt, i);
				a !== r.adjustmentPt && (e[t.compressionIndex] = {
					end: r.end,
					adjustmentPt: a
				}, n.set(t.segment, e));
			}
			t = c !== void 0 && l ? {
				segment: e,
				compressionIndex: c,
				ink: l
			} : void 0;
		}
	}
	for (let [e, t] of n) e.punctuationCompressions = Object.freeze(t.map((e) => Object.freeze(e)));
}
function No(e) {
	return e.charScale ?? 1;
}
function Po(e, t, n, r, i) {
	return e * r + To(t, n) + [...t].length * i;
}
function Fo(e, t, n, r) {
	if (e.fitTextPerGapPx !== void 0) {
		let n = [...e.text].length, r = e.fitTextRegionEnd ? Math.max(0, n - 1) : n;
		return t * No(e) + r * e.fitTextPerGapPx + (e.fitTextTrailingPadPx ?? 0);
	}
	if (e.tateChuYoko) return e.fontSize * r;
	let i = Eo(e, n);
	return Po(t, e.text, i, No(e), Do(e, r)) + ko(e) * r;
}
function Io(e) {
	return !e || !e.linePitchPt || e.linePitchPt <= 0 ? !1 : e.type === "lines" || e.type === "linesAndChars" || e.type === "snapToChars";
}
function Lo(e, t) {
	return Ya(e, t);
}
function Ro(e, t) {
	return Xa(e, t);
}
function zo(e, t, n, r, i, a, o = 0, s = !1, c, l) {
	let u = t + n, d = Math.max(u, o), f = Io(i), p = f ? i.linePitchPt * r : 0, m = () => s ? a ? Math.max(p, Math.ceil(u / p) * p) : Lo(c ?? (o > 0 ? o : l === void 0 ? p : Ro(0, l)), p) * p : Math.max(u, p), h = e !== null && e.explicit !== !0;
	if (!e || $a(e.rule, e.value)) return f ? m() : d;
	if (e.rule === "auto") {
		if (f) {
			if (h) {
				let t = m();
				return s ? Za(t, p, e.value) : t;
			}
			return Math.max(u, p * e.value);
		}
		return d * e.value;
	}
	if (e.rule === "exact") return e.value * r;
	if (e.rule === "atLeast") {
		let t = f ? a || h ? m() : p : 0;
		return Qa(d, e.value * r, t);
	}
	return d;
}
function Bo(e, t) {
	return {
		asc: e * t * .8,
		desc: e * t * .2
	};
}
function Vo(e, t, n, r, i = !1) {
	return ie(t, r, e.fontBoundingBoxAscent ?? e.actualBoundingBoxAscent ?? n * .8, e.fontBoundingBoxDescent ?? e.actualBoundingBoxDescent ?? n * .2, i);
}
function Ho(e, t, n, r, i = !1, a, o = {}, s = e.lineSpacing, c = {}, l, u) {
	let d = u, f = i || d?.fontHint === "eastAsia", p = d?.complexScript === !0, m = d?.fontSizePt ?? xo(e), h = So(e, f), g = h ? c[mn(h)] : void 0, _ = g?.family ?? h, v, y;
	if (l) {
		let n = d ? d.weight >= 600 : !1, r = d?.style === "italic", i = d?.fonts.ascii ?? e.defaultFontFamily ?? h, a = l.shape({
			text: f ? "あ" : "x",
			fontSizePt: m * t,
			fonts: d?.fonts ?? {
				ascii: i,
				highAnsi: i,
				eastAsia: e.defaultFontFamilyEastAsia ?? i,
				complexScript: i
			},
			themeFonts: d?.themeFonts,
			themeFontPresence: d?.themeFontPresence,
			weight: n ? 700 : 400,
			style: r ? "italic" : "normal",
			complexScript: p,
			fontHint: d?.fontHint,
			eastAsiaLanguage: d?.eastAsiaLanguage,
			kerning: d?.kerning,
			measure: !0
		}), o = a.spans[0]?.font.resolvedFamily ?? h;
		({ascent: v, descent: y} = Vo({
			width: a.advancePt,
			actualBoundingBoxAscent: a.ascentPt,
			actualBoundingBoxDescent: a.descentPt,
			fontBoundingBoxAscent: a.ascentPt,
			fontBoundingBoxDescent: a.descentPt
		}, o, m * t, m * t, f));
	} else if (a) {
		let e = a.font;
		a.font = vo(!1, !1, m * t, _, o);
		let n = a.measureText(f ? "あ" : "x");
		a.font = e, {ascent: v, descent: y} = Vo(n, _, m * t, m * t, f);
	} else ({asc: v, desc: y} = Bo(m, t));
	let b = g?.lineHeightRatio == null ? Co(e, t, f) : m * t * g.lineHeightRatio, x = Math.max(b, Ja(h, m * t, f)), S = i ? Ro(x, m * t) : void 0;
	return {
		advancePx: zo(s, v, y, t, n, r, x, i, S),
		ascentPx: v,
		descentPx: y
	};
}
function Uo(e, t, n, r, i = !1, a, o = {}, s = e.lineSpacing, c = {}, l, u) {
	return Ho(e, t, n, r, i, a, o, s, c, l, u).advancePx;
}
function Wo(e, t, n) {
	return Math.max(0, (e - t + n) / 2);
}
function Go(e, t, n, r, i, a, o, s = {}, c, l) {
	let u = Ho(e, 1, t, n, r, i, a, o, s, c, l);
	return Wo(u.advancePx, u.ascentPx, u.descentPx);
}
function Ko(e) {
	let t = [];
	for (let n of e) {
		let e = n.toLowerCase() === n && n.toUpperCase() !== n, r = /\s/.test(n) ? t[t.length - 1]?.reduced ?? !1 : e, i = t[t.length - 1];
		i && i.reduced === r ? i.text += n : t.push({
			text: n,
			reduced: r
		});
	}
	return t.length ? t : [{
		text: e,
		reduced: !1
	}];
}
function qo(e, t) {
	for (let n = t - 1; n >= 0; n--) {
		let t = e[n];
		if (t.type === "text" || t.type === "field") return t.fontSize;
	}
	for (let n = t + 1; n < e.length; n++) {
		let t = e[n];
		if (t.type === "text" || t.type === "field") return t.fontSize;
	}
	return 10;
}
function Jo(e, t) {
	if (e.fieldType === "page") return Bt(t.displayPageNumber ?? t.pageIndex + 1, on(e.instruction) ?? t.pageNumberFormat ?? "decimal");
	if (e.fieldType === "numPages") {
		let n = on(e.instruction) ?? "decimal";
		return Bt(t.totalPages, n);
	}
	if (e.fieldType === "date" || e.fieldType === "time") {
		let n = fn(e.instruction);
		if (n) {
			let e = pn(n, new Date(t.currentDateMs ?? Date.now()));
			if (e !== null) return e;
		}
		return e.fallbackText;
	}
	return e.fallbackText;
}
var Yo = new Set([
	"+",
	"-",
	"−",
	"=",
	"±",
	"×",
	"÷"
]);
function Xo(e) {
	return Yo.has(e) ? ` ${e} ` : e;
}
function Y(e) {
	return e.map((e) => {
		switch (e.kind) {
			case "run": return Xo(e.text);
			case "fraction": return `${Y(e.num)}/${Y(e.den)}`;
			case "sup": return `${Y(e.base)}^${Y(e.sup ?? [])}`;
			case "sub": return `${Y(e.base)}_${Y(e.sub ?? [])}`;
			case "subSup": return `${Y(e.base)}_${Y(e.sub ?? [])}^${Y(e.sup ?? [])}`;
			case "nary": return `${e.op}${Y(e.sub ?? [])}${Y(e.sup ?? [])}${Y(e.body)}`;
			case "delimiter": return `${e.begChar}${e.items.map(Y).join(",")}${e.endChar}`;
			case "radical": return `${e.index && e.index.length > 0 ? Y(e.index) : ""}√${Y(e.radicand)}`;
			case "limit": return `${Y(e.base)}${Y(e.lower ?? [])}${Y(e.upper ?? [])}`;
			case "array": return e.rows.map((e) => e.map(Y).join(" ")).join(" ");
			case "groupChr": return `${e.char}${Y(e.base)}`;
			case "bar":
			case "box":
			case "borderBox": return Y(e.base);
			case "accent": return `${e.char}${Y(e.base)}`;
			case "func": return `${Y(e.name)}(${Y(e.arg)})`;
			case "group": return Y(e.items);
			case "phant": return e.show ? Y(e.base) : "";
			case "sPre": return `${Y(e.sub)}${Y(e.sup)}${Y(e.base)}`;
		}
	}).join("").replace(/[ \t]{2,}/g, " ");
}
function Zo(e) {
	for (let t = 0; t < e.length;) {
		let n = e.codePointAt(t);
		if (w(n)) return !0;
		t += n > 65535 ? 2 : 1;
	}
	return !1;
}
var Qo = new Set([
	"、",
	"。",
	"，",
	"．",
	"」",
	"』",
	"】",
	"〗",
	"）",
	"］",
	"｝",
	"！",
	"？"
]);
function $o(e) {
	let t = e.codePointAt(0);
	return t === void 0 ? !1 : t >= 12353 && t <= 12438 || t >= 12445 && t <= 12447 || t >= 12449 && t <= 12538 || t === 12540 || t >= 12541 && t <= 12543 || t >= 12784 && t <= 12799 || t >= 110576 && t <= 110591 || t >= 110592 && t <= 110959;
}
function es(e, t) {
	switch (t) {
		case "compressPunctuation": return Qo.has(e);
		case "compressPunctuationAndJapaneseKana": return Qo.has(e) || $o(e);
		default: return !1;
	}
}
function ts(e, t) {
	if (e === void 0) return;
	let n = [];
	for (let r of e) r > t && n.push(r - t);
	return n;
}
function ns(e, t) {
	if (t <= 0) return t;
	let n = t;
	for (; n < e.length && e[n] === "　";) n++;
	return n;
}
function rs(e, t, n, r = 0, i = 1, a = 0, o = !1, s, c) {
	let l = [...t], u = (t) => c?.(t) ?? (() => {
		let n = 0;
		if (o) {
			if (!s) throw Error("Vertical glyph measurement capability is required for vertical text");
			n = s.measureRunInkExtra(t);
		}
		return Po(e.measureText(t).width + n, t, r, i, a);
	})(), d = (e) => {
		let t = e;
		for (; t > 0 && l[t - 1] === "　";) t--;
		let r = l.slice(0, t).join("");
		return r.length === 0 ? !0 : u(r) <= n;
	}, f = 0, p = l.length;
	for (; f < p;) {
		let e = f + p + 1 >> 1;
		d(e) ? f = e : p = e - 1;
	}
	return l.slice(0, f).join("");
}
var is = new Set([
	"ar",
	"fa",
	"ur",
	"he",
	"iw",
	"yi",
	"ji",
	"ps",
	"sd",
	"ug",
	"dv",
	"syr",
	"ckb"
]);
function as(e, t) {
	if (e) {
		let t = e.split("-")[0].toLowerCase();
		if (is.has(t)) return !0;
	}
	return t;
}
function os(e) {
	let t = [], n = null, r = "";
	for (let i of e) {
		let e = w(i.codePointAt(0));
		n === null || e === n ? (n = e, r += i) : (t.push({
			text: r,
			ea: n
		}), n = e, r = i);
	}
	return r.length > 0 && t.push({
		text: r,
		ea: n ?? !1
	}), t;
}
function ss(e) {
	let t = (e) => e >= 48 && e <= 57, n = (e) => e === "." || e === "," || e === ":" || e === "/" || e === "\xA0", r = [], i = "", a = null;
	for (let o = 0; o < e.length; o++) {
		let s = e[o], c = t(s.charCodeAt(0));
		!c && a === !0 && n(s) && t(e.charCodeAt(o + 1)) && (c = !0), a === null || c === a ? i += s : (r.push(i), i = s), a = c;
	}
	return i.length > 0 && r.push(i), r.length ? r : [e];
}
function cs(e) {
	let t = [], n = 0;
	for (; n < e.length;) {
		let r = n;
		for (; r < e.length && e[r] !== " ";) r++;
		for (; r < e.length && e[r] === " ";) r++;
		r > n && t.push(e.slice(n, r)), n = r;
	}
	return t.length ? t : [e];
}
var ls = .25;
function us(e) {
	let t = e?.defaultTabStop;
	return t != null && t > 0 ? t : 36;
}
function ds(e) {
	return e === "center" ? "center" : e === "right" || e === "end" || e === "decimal" ? "trailing" : "leading";
}
function fs(e, t, n, r, i) {
	let a = e.length, o = e.map((e) => e.width), s = Array(a).fill(void 0), c = (t) => {
		let n = 0;
		for (let r = t; r < a && !e[r].isTab; r++) n += o[r];
		return n;
	}, l = n;
	for (let n = 0; n < a; n++) {
		if (!e[n].isTab) {
			l += o[n];
			continue;
		}
		let a = Tr(l, t, i);
		if (!a) {
			o[n] = 0;
			continue;
		}
		let u = c(n + 1), d, f = ds(a.alignment);
		d = f === "trailing" ? a.pos - u : f === "center" ? a.pos - u / 2 : a.pos, d + u > r && (d = r - u), d < l && (d = l), o[n] = d - l, s[n] = a.leader, l = d;
	}
	return e.map((e, t) => ({
		width: o[t],
		leader: s[t]
	}));
}
function ps(e, t, n) {
	let r = /* @__PURE__ */ new Map();
	for (let t of e) {
		if (t.fitTextRegionIndex === void 0) continue;
		let e = r.get(t.fitTextRegionIndex) ?? [];
		e.push(t), r.set(t.fitTextRegionIndex, e);
	}
	for (let e of r.values()) {
		let r = e.find((e) => e.fitTextVal !== void 0);
		if (!r || r.fitTextVal === void 0) continue;
		let i = 0, a = 0;
		for (let t of e) i += n(t) * No(t), a += [...t.text].length;
		let o = Fr([{
			fitTextValTwips: r.fitTextVal,
			charCount: a,
			naturalWidthPx: i
		}], t)[0];
		o && e.forEach((t, n) => {
			t.fitTextPerGapPx = o.perGapPx, t.fitTextTrailingPadPx = n === e.length - 1 ? o.trailingPadPx : void 0, t.fitTextRegionStart = n === 0 ? !0 : void 0, t.fitTextRegionEnd = n === e.length - 1 ? !0 : void 0;
		});
	}
}
function ms(e, t) {
	let n = [], r = (e, n = 400, r = "normal") => {
		if (!e) return;
		let i = mn(e), a = t.resolvedLocalFonts;
		if (!a) return;
		let o = a[`${i}:${n}:${r}`];
		if (o) return o;
		let s = a[i];
		return n === 400 && r === "normal" && s ? s : Object.values(a).find((e) => mn(e.requestedFamily ?? "") === i && (e.weight ?? 400) === n && (e.style ?? "normal") === r);
	}, a = /* @__PURE__ */ new Map(), o = [];
	for (let [t, n] of e.entries()) {
		if (n.type !== "text") {
			o.push({
				charCount: 0,
				naturalWidthPx: 0
			});
			continue;
		}
		let e = n.text.split("	");
		for (let r = 0; r < e.length; r += 1) a.set(`${t}:${r}`, o.length), o.push({
			fitTextValTwips: n.fitTextVal,
			fitTextId: n.fitTextId,
			charCount: [...e[r]].length,
			naturalWidthPx: 0,
			charScale: n.charScale
		}), r < e.length - 1 && o.push({
			charCount: 0,
			naturalWidthPx: 0
		});
	}
	let s = /* @__PURE__ */ new Map();
	Fr(o, 1).forEach((e, t) => {
		for (let n = e.start; n < e.end; n += 1) s.set(n, t);
	});
	let c = (e, o, c, l, u) => {
		let d = o, f = !1, p = d.ruby, m = p ? {
			text: p.text,
			fontSizePt: p.fontSizePt,
			...p.hpsRaisePt == null ? {} : { hpsRaisePt: p.hpsRaisePt }
		} : void 0, h = d.revision, g = d.rtl === !0 ? !0 : void 0, _ = u === void 0 ? void 0 : a.get(`${l}:${u}`), v = _ === void 0 ? void 0 : s.get(_), y = d.hyperlink ? {
			kind: "external",
			url: d.hyperlink
		} : d.hyperlinkAnchor ? {
			kind: "internal",
			ref: d.hyperlinkAnchor
		} : void 0, b = d.rtl === !0 || d.cs === !0, x = d.fontSizeCs ?? o.fontSize, S = d.fontFamilyCs ?? o.fontFamily, C = d.fontFamilyHighAnsi ?? o.fontFamily, w = d.boldCs ?? !1, T = d.italicCs ?? !1, E = d.fontFamilyEastAsia ?? o.fontFamily, D = (b || d.rtl === !0) && as(d.langBidi, d.rtl === !0), O = !0, k = !1, A = (e, a, s, l, u = !1) => {
			if (!u && v === void 0) {
				let n = [
					0,
					...i(e),
					e.length
				];
				if (n.slice(0, -1).map((t, r) => e.slice(t, n[r + 1])).some((e) => es(e, t.characterSpacingControl))) {
					A(e, a, s, void 0, !0);
					return;
				}
			}
			let p = a ? w : o.bold, b = a ? T : o.italic, j = p ? 700 : 400, M = b ? "italic" : "normal", N = Object.freeze({
				text: e,
				fontSizePt: a ? x : o.fontSize,
				fonts: d.fontSlots?.direct ?? {
					ascii: o.fontFamily,
					highAnsi: C,
					eastAsia: E,
					complexScript: S
				},
				themeFonts: d.fontSlots?.theme,
				themeFontPresence: d.fontSlots?.themePresent,
				weight: j,
				style: M,
				complexScript: a,
				fontHint: d.fontHint,
				eastAsiaLanguage: d.langEastAsia,
				kerning: d.kerning == null ? void 0 : (a ? x : o.fontSize) >= d.kerning,
				measure: !1
			}), P = l ? { spans: [l] } : t.layoutServices?.text.shape(N), ee = u ? (() => {
				let n = [
					0,
					...i(e),
					e.length
				], r = [];
				for (let i = 0; i < n.length - 1; i += 1) {
					let a = n[i], o = n[i + 1], s = e.slice(a, o);
					if (!es(s, t.characterSpacingControl)) continue;
					let c = t.layoutServices?.text.shape({
						...N,
						text: s,
						measure: !0,
						clusterGeometry: !1
					}), l = (c?.inkBounds && c.horizontalInkBoundsAreTight === !0 ? (() => {
						let e = Math.max(0, Math.min(c.advancePt, c.advancePt - c.inkBounds.xMaxPt));
						if (!Qo.has(s)) return e;
						let n = c.spans[0]?.fontRoute.fingerprint, r = t.layoutServices?.text.shape({
							...N,
							text: "　",
							fontHint: "eastAsia",
							measure: !0,
							clusterGeometry: !1
						}), i = r?.spans[0]?.fontRoute.fingerprint, a = r?.advancePt;
						if (!n || i !== n || a === void 0 || !Number.isFinite(a) || a <= 0) return 0;
						let o = za({
							punctuationAdvancePt: c.advancePt,
							punctuationInkEndPt: c.inkBounds.xMaxPt,
							ideographicCellAdvancePt: a
						});
						return Math.max(0, Math.min(e, c.advancePt - o));
					})() : 0) * (d.charScale ?? 1);
					l > 0 && r.push({
						end: o,
						adjustmentPt: -l
					});
				}
				return r.length === 0 ? void 0 : Object.freeze(r.map((e) => Object.freeze(e)));
			})() : void 0, F = P?.spans.some((e) => e.script === "complexScript" !== a) ?? !1;
			if (P && (P.spans.length > 1 || F)) {
				for (let e = 0; e < P.spans.length; e += 1) {
					let n = P.spans[e], r = n.script === "complexScript", i = r ? S : n.script === "eastAsia" ? E : n.script === "highAnsi" ? C : o.fontFamily, a = u && [...n.text].some((e) => es(e, t.characterSpacingControl));
					A(n.text, r, i, n, a);
				}
				return;
			}
			let I = P?.spans[0], L = (e, n) => {
				if (!e) return;
				let r = Object.values(t.layoutServices?.text.localMetrics ?? {}).filter((t) => mn(t.family) === mn(e) && (t.weight ?? 400) === j && (t.style ?? "normal") === M);
				return r.find((e) => n && mn(e.requestedFamily ?? "") === mn(n)) ?? r[0];
			}, te = I ? L(I.font.resolvedFamily, I.font.requestedFamily) : r(s, j, M), ne = t.layoutServices?.text.resolve({
				fonts: N.fonts,
				themeFonts: N.themeFonts,
				themeFontPresence: N.themeFontPresence,
				slot: "eastAsia",
				weight: j,
				style: M
			}), re = ne ? L(ne.resolvedFamily, ne.requestedFamily) : r(E, j, M), ie = te ?? (s ? t.resolvedLocalFonts?.[mn(s)] : void 0), ae = re ?? (E ? t.resolvedLocalFonts?.[mn(E)] : void 0);
			n.push({
				text: e,
				...t.useFeLayout && d.fontHint === "eastAsia" ? { metricEastAsian: !0 } : {},
				bold: p,
				italic: b,
				underline: o.underline,
				underlineStyle: d.underlineStyle,
				underlineColor: d.underlineColor,
				strikethrough: o.strikethrough,
				fontSize: a ? x : o.fontSize,
				color: o.color,
				fontFamily: I?.font.resolvedFamily ?? te?.family ?? s,
				fontRoute: I?.fontRoute,
				resolvedLineHeightRatio: ie?.lineHeightRatio,
				vertAlign: c,
				measuredWidth: 0,
				textLayoutService: t.layoutServices?.text,
				textShapeRequest: N,
				breakBefore: I?.breakBefore ?? l?.breakBefore ?? !0,
				smallCaps: f,
				joinPrev: k || l?.breakBefore === !1 ? !0 : void 0,
				doubleStrikethrough: o.doubleStrikethrough ?? !1,
				highlight: o.highlight ?? null,
				emphasisMark: o.emphasisMark,
				background: o.background ?? null,
				colorAuto: d.colorAuto ?? !1,
				border: d.border ?? null,
				ruby: O ? m : void 0,
				revision: h,
				rtl: g,
				digitsAsAN: D ? !0 : void 0,
				eaFloorFamily: ne?.resolvedFamily ?? re?.family ?? E,
				eaFloorRoute: ne?.route,
				resolvedEaFloorLineHeightRatio: ae?.lineHeightRatio,
				textBoxLineFloor: d.textBoxLineFloor,
				textBoxVertical: d.textBoxVertical,
				hyperlink: y,
				snapToCharacterGrid: d.snapToGrid !== !1,
				charSpacing: d.charSpacing,
				punctuationCompressions: ee,
				eastAsiaLanguage: d.langEastAsia,
				charScale: d.charScale,
				fitTextVal: v === void 0 ? void 0 : d.fitTextVal,
				fitTextId: v === void 0 ? void 0 : d.fitTextId,
				fitTextRegionIndex: v,
				fitTextRunIndex: v === void 0 ? void 0 : _,
				position: d.position,
				kerning: d.kerning,
				tateChuYoko: t.verticalCJK && d.eastAsianVert === !0 ? !0 : void 0,
				tateChuYokoCompress: t.verticalCJK && d.eastAsianVert === !0 && d.eastAsianVertCompress === !0 ? !0 : void 0,
				verticalRun: t.verticalCJK && d.eastAsianVert !== !0 ? !0 : void 0
			}), O = !1, k = !1;
		}, j = (e, t) => {
			let n = t === "cs", r = t === "cs" ? S : t === "ea" ? E : o.fontFamily;
			if (Ve(r)) {
				for (let t of qe(e, r)) A(t.text, n, t.mapped ? null : r);
				return;
			}
			A(e, n, r);
		}, M = (e) => {
			if (t.layoutServices?.text) {
				A(e, !1, o.fontFamily);
				return;
			}
			for (let t of os(e)) j(t.text, t.ea ? "ea" : "latin");
		}, N = o.smallCaps ? Ko(e) : [{
			text: e,
			reduced: !1
		}], P = "";
		for (let e of N) {
			f = e.reduced, k = P.length > 0 && !/\s$/.test(P), P = e.text;
			let t = o.allCaps || o.smallCaps ? e.text.toUpperCase() : e.text;
			for (let e of cs(t)) if (b) if (D) for (let t of ss(e)) j(t, "cs");
			else j(e, "cs");
			else M(e);
		}
	};
	for (let [i, a] of e.entries()) {
		let o = n.length;
		if (a.type === "text") {
			let e = a, r = e.noteRef ? e.noteRef.id ? t.noteNumbers?.get(`${e.noteRef.kind}:${e.noteRef.id}`) : t.noteReferenceNumber : void 0;
			if (e.noteRef) {
				let t = r == null ? e.text || "" : String(r);
				t.length > 0 && c(t, e, e.vertAlign ?? "super", i, 0);
				for (let e = o; e < n.length; e += 1) n[e].sourceRunIndex = i;
				continue;
			}
			let s = e.text.split("	");
			for (let t = 0; t < s.length; t++) s[t].length > 0 && c(s[t], e, e.vertAlign, i, t), t < s.length - 1 && n.push({
				isTab: !0,
				fontSize: e.fontSize,
				measuredWidth: 0,
				bold: e.bold,
				italic: e.italic
			});
		} else if (a.type === "image") {
			let e = a;
			n.push({
				imagePath: e.imagePath,
				mimeType: e.mimeType,
				widthPt: e.widthPt,
				heightPt: e.heightPt,
				rotation: e.rotation,
				flipH: e.flipH,
				flipV: e.flipV,
				anchor: e.anchor ?? !1,
				anchorXPt: e.anchorXPt ?? 0,
				anchorYPt: e.anchorYPt ?? 0,
				anchorXFromMargin: e.anchorXFromMargin ?? !1,
				anchorYFromPara: e.anchorYFromPara ?? !1,
				colorReplaceFrom: e.colorReplaceFrom,
				duotone: e.duotone,
				alpha: e.alpha,
				srcRect: e.srcRect ?? void 0,
				measuredWidth: 0
			});
		} else if (a.type === "chart") {
			let e = a;
			n.push({
				imagePath: "",
				mimeType: "",
				widthPt: e.widthPt,
				heightPt: e.heightPt,
				anchor: e.anchor ?? !1,
				anchorXPt: e.anchorXPt ?? 0,
				anchorYPt: e.anchorYPt ?? 0,
				anchorXFromMargin: e.anchorXFromMargin ?? !1,
				anchorYFromPara: e.anchorYFromPara ?? !1,
				chart: e.chart,
				measuredWidth: 0
			});
		} else if (a.type === "unavailableDrawing") {
			let e = "anchorAcquisitionInput" in a ? a.anchorAcquisitionInput : void 0;
			n.push({
				imagePath: "",
				mimeType: "",
				widthPt: a.widthPt,
				heightPt: a.heightPt,
				anchor: e !== void 0,
				anchorXPt: 0,
				anchorYPt: 0,
				anchorXFromMargin: !1,
				anchorYFromPara: !1,
				unavailableResourceKind: a.resourceKind,
				measuredWidth: 0
			});
		} else if (a.type === "break") {
			if (a.breakType === "line") {
				let t = qo(e, e.indexOf(a));
				n.push({
					lineBreak: !0,
					fontSize: t,
					measuredWidth: 0
				});
			}
		} else if (a.type === "field") {
			let e = a, n = Jo(e, t);
			n && c(n, e, e.vertAlign, i);
		} else if (a.type === "math") {
			let r = a.fontSize || qo(e, e.indexOf(a)), i = a.resourceKey;
			if (t.layoutServices && !i) throw Error("Service-backed math layout requires a normalized structural resource key");
			let o = i ? t.layoutServices?.math.resolve(i) : void 0;
			n.push({
				mathNodes: a.nodes,
				mathResourceKey: i ?? "",
				mathMetadata: o,
				display: a.display,
				fontSize: r,
				color: null,
				fallbackText: Y(a.nodes),
				measuredWidth: 0,
				mathAscent: 0,
				mathDescent: 0,
				jc: a.jc
			});
		} else if (a.type === "ptab") n.push({
			isTab: !0,
			fontSize: a.fontSize || qo(e, e.indexOf(a)),
			measuredWidth: 0,
			leader: a.leader,
			ptab: {
				alignment: a.alignment,
				relativeTo: a.relativeTo
			}
		});
		else if (a.type === "anchorHost") {
			let e = a.fontFamilyEastAsia != null, i = a.bold ?? !1, o = a.italic ?? !1, s = a.fontFamilyEastAsia ?? a.fontFamily ?? null, c = i ? 700 : 400, l = o ? "italic" : "normal", u = r(s, c, l), d = r(a.fontFamilyEastAsia ?? null, c, l), f = u ?? (s ? t.resolvedLocalFonts?.[mn(s)] : void 0), p = d ?? (a.fontFamilyEastAsia ? t.resolvedLocalFonts?.[mn(a.fontFamilyEastAsia)] : void 0);
			n.push({
				text: "",
				metricOnly: !0,
				...e ? { metricEastAsian: !0 } : {},
				bold: i,
				italic: o,
				underline: !1,
				strikethrough: !1,
				fontSize: a.fontSize,
				color: null,
				fontFamily: u?.family ?? s,
				resolvedLineHeightRatio: f?.lineHeightRatio,
				vertAlign: null,
				measuredWidth: 0,
				eaFloorFamily: d?.family ?? a.fontFamilyEastAsia ?? null,
				resolvedEaFloorLineHeightRatio: p?.lineHeightRatio,
				snapToCharacterGrid: !1
			});
		}
		for (let e = o; e < n.length; e += 1) n[e].sourceRunIndex = i;
	}
	for (let e = 1; e < n.length; e++) {
		let t = n[e];
		if (!("text" in t) || t.joinPrev) continue;
		let r = t.text.codePointAt(0);
		if (r === void 0 || !E.lineStartForbidden.has(r)) continue;
		let i = n[e - 1];
		!("text" in i) || /\s$/.test(i.text) || (t.joinPrev = !0);
	}
	for (let e = 1; e < n.length; e++) {
		let t = n[e];
		if (!("text" in t) || t.joinPrev || t.text.length === 0) continue;
		let r = n[e - 1];
		if (!("text" in r) || r.text.length === 0 || /\s$/u.test(r.text) || /^\s/u.test(t.text)) continue;
		let i = [...r.text].at(-1), a = [...t.text][0], o = i?.codePointAt(0), s = a?.codePointAt(0);
		o === void 0 || s === void 0 || o === 8203 || s === 8203 || A(r.text) || A(t.text) || Zo(r.text) || Zo(t.text) || x(o, s) && (t.joinPrev = !0);
	}
	let l = /* @__PURE__ */ new Set();
	for (let e of n) !("text" in e) || e.fitTextRegionIndex === void 0 || (l.has(e.fitTextRegionIndex) ? e.joinPrev = !0 : (e.fitTextRegionStart = !0, l.add(e.fitTextRegionIndex)));
	return Mo(n), n;
}
function hs(e, t, n, r, o, s = [], c, l = {}, u = 0, f = E, p = 0, m = 36, h = n, g = !1, v = !1, b = !1, x, S = "bounded", w, T = !1, D) {
	if (D === void 0) {
		let i = (i, a) => hs(e, Fa(t), n, r, o, s, c, l, u, f, p, m, h, g, v, b, x, S, w, T, {
			probeHeights: i,
			preparedFloatWrap: a
		});
		if (!c || S === "intrinsic") return i(null);
		let a = c.lineWindow ? void 0 : aa(c.floats);
		return Ra((e) => i(e, a), (e) => c.lineBoxH(e.ascent, e.descent, e.hasRuby, e.intendedSingle, e.eastAsian, e.gridCountSingle));
	}
	let { probeHeights: O, preparedFloatWrap: k } = D, j = [], M = [], N = 0, P = 0, ee = 0, F = /* @__PURE__ */ new Set(), I = 0, L = 0, te = 0, ne = 0, re = 0, ie = 0, ae = 0, oe = 0, se = !1, ce = !0, le = n, ue = 0, de = c?.startPageY ?? 0, fe = () => ki(o), pe = t.length > 0 && t.every((e) => "text" in e && e.metricOnly === !0 || "imagePath" in e && !!e.anchor), me = (e = 0) => {
		if (ee = 0, F.clear(), ue = 0, le = n, !c) return;
		let t = O?.[j.length];
		if (t === void 0) return;
		let r = {
			xLeftPt: c.referenceXPt ?? c.paraX,
			xRightPt: (c.referenceXPt ?? c.paraX) + (c.referenceWidthPt ?? n),
			readingDirection: c.readingDirection ?? (g ? "rtl" : "ltr")
		};
		if (c.lineWindow) {
			let r = c.lineWindow({
				topYPt: de,
				minimumStartWidthPt: 1,
				squareMinimumStartWidthPt: e,
				probeHeightPt: t,
				paragraphXPt: c.paraX,
				maximumWidthPt: n,
				columnXPt: c.columnXPt,
				columnWidthPt: c.columnWidthPt
			});
			de = r.topYPt, ue = r.xOffsetPt, le = r.maximumWidthPt;
		} else {
			let i = Ca(de, 1, t, c.paraX, n, k ?? aa(c.floats), c.columnXPt, c.columnXPt + c.columnWidthPt, r, e);
			de = i.topY, ue = i.xOffset, le = i.maxWidth;
		}
	}, he = () => S === "intrinsic" ? Infinity : le - (ce ? r : 0), _e = g ? s.map((e) => ({
		pos: e.pos * o,
		alignment: e.alignment,
		leader: e.leader
	})) : [], ve = m * o, ye = () => {
		if (!g || !M.some((e) => "isTab" in e)) return;
		let e = fs(M.map((e) => ({
			isTab: "isTab" in e,
			width: e.measuredWidth
		})), _e, h - (ue + le) + (ce ? r : 0), h + u, ve), t = 0;
		for (let n = 0; n < M.length; n++) {
			let r = M[n];
			"isTab" in r && (t += e[n].width - r.measuredWidth, r.measuredWidth = e[n].width, r.leader = e[n].leader);
		}
		N += t;
	}, be = !1, xe = !1, Se = !1, R = (e, t = !1, n) => {
		ye();
		let r = e === void 0 ? I || 10 : Math.max(I, e), i = L > 0 || te > 0, a = i ? L : r * o * .8, s = i ? te : r * o * .2, l = se ? ie : a, u = se ? ae : s, d = se ? oe : ne, f = re || (xe ? Ro(ne, r * o) : a + s);
		j.push({
			segments: M,
			height: r,
			ascent: a,
			descent: s,
			visibleAscent: l,
			visibleDescent: u,
			visibleIntendedSingle: d,
			intendedSingle: ne,
			gridCountSingle: f,
			xOffset: ue,
			availWidth: le,
			topY: c ? de : void 0,
			hasRuby: be,
			eastAsian: xe,
			endsWithBreak: t,
			consumedEnd: n ?? B[0]?.src ?? Pe
		}), c && (de += c.lineBoxH(a, s, be, ne, xe, f)), M = [], N = 0, P = 0, ee = 0, F.clear(), I = 0, L = 0, te = 0, ne = 0, re = 0, ie = 0, ae = 0, oe = 0, se = !1, be = !1, xe = !1, Se = !1, ce = !1, me(fe());
	}, Ce = (e, t = e.text) => Sn(e.fontFamily) * Sr(e, o) * No(e) * [...t].length, we = (e) => {
		let t = e.bold ? 700 : 400, n = e.italic ? "italic" : "normal";
		return e.fontRoute ? `${e.fontRoute.fingerprint}|${t}|${n}` : `implicit|${vo(e.bold, e.italic, 1, e.fontFamily, l)}`;
	}, Te = (e, t, n = t.text) => {
		/\S/.test(n) && e.add(we(t));
	}, Ee = (e) => {
		let t = F.size;
		for (let n of e) F.has(n) || (t += 1);
		return t;
	}, z = (e, t, n, r, i, a = 0) => {
		M.push(e), N += t, P += a, "text" in e && (ee += Ce(e), Te(F, e)), n > I && (I = n), r > L && (L = r), i > te && (te = i);
		let s = !("text" in e) || e.metricOnly !== !0;
		s && (se = !0, r > ie && (ie = r), i > ae && (ae = i));
		let c = 0;
		if (!("isTab" in e) && !("imagePath" in e) && !("mathNodes" in e)) {
			let t = e;
			t.ruby && (be = !0), t.seaBreaks !== void 0 && C(t.text) && (Se = !0);
			let n = t.metricEastAsian === !0 || Cr.test(t.text);
			!xe && n && (xe = !0);
			let r = t.smallCaps && !t.vertAlign ? t.fontSize * o : De(t), i = n && !t.ruby, a = t.textBoxLineFloor && t.ruby ? 0 : Math.max(yo(t, r, i), t.textBoxLineFloor ? bo(t, r, i) : 0);
			a > ne && (ne = a), s && a > oe && (oe = a), i && (c = Ro(a, r));
		} else "isTab" in e || (c = r + i);
		c > re && (re = c);
	}, De = (e) => Sr(e, o), Oe = null, ke = (t) => {
		t !== Oe && (e.font = t, Oe = t);
	}, Ae = (t) => {
		if (t.kerning == null) return null;
		let n = e.fontKerning;
		return e.fontKerning = t.fontSize >= t.kerning ? "normal" : "none", n;
	}, je = (t) => {
		t != null && (e.fontKerning = t);
	}, Me = (t, n = !1) => {
		if (t.textLayoutService && t.textShapeRequest) {
			let e = t.textLayoutService.shape({
				...t.textShapeRequest,
				text: t.text,
				fontSizePt: De(t),
				measure: !0,
				clusterGeometry: n
			});
			return n && (t.shapedClusters = e.clusters, t.selectedFaceInkBounds = e.inkBounds ?? {
				xMinPt: 0,
				xMaxPt: e.advancePt,
				ascentPt: e.ascentPt,
				descentPt: e.descentPt
			}), {
				width: e.advancePt,
				actualBoundingBoxAscent: e.ascentPt,
				actualBoundingBoxDescent: e.descentPt,
				fontBoundingBoxAscent: e.ascentPt,
				fontBoundingBoxDescent: e.descentPt
			};
		}
		ke(vo(t.bold, t.italic, De(t), t.fontFamily, l, t.fontRoute));
		let r = Ae(t), i = e.measureText(t.text);
		return je(r), i;
	}, Ne = (e, t) => {
		if (!e.verticalRun) return 0;
		if (!w) throw Error("Vertical glyph measurement capability is required for vertical text");
		ke(vo(e.bold, e.italic, De(e), e.fontFamily, l, e.fontRoute));
		let n = Ae(e);
		try {
			return w.measureRunInkExtra(t);
		} finally {
			je(n);
		}
	}, Pe = {
		segIndex: t.length,
		charOffset: 0
	}, Fe = t.map((e, t) => (e.src = {
		segIndex: t,
		charOffset: 0
	}, "text" in e && A(e.text) && (e.seaBreaks = y(e.text, {
		cjk: !0,
		kinsoku: f
	})), e)), B;
	if (!x) B = Fe;
	else if (x.segIndex >= Fe.length) B = [];
	else {
		let e = Fe[x.segIndex];
		if (x.charOffset > 0) if (!("text" in e) || x.charOffset > e.text.length) B = [];
		else {
			let t = e.text.slice(x.charOffset);
			B = t ? [{
				...e,
				text: t,
				measuredWidth: 0,
				src: { ...x },
				punctuationCompressions: Ao(e, x.charOffset, e.text.length),
				seaBreaks: ts(e.seaBreaks, x.charOffset)
			}, ...Fe.slice(x.segIndex + 1)] : Fe.slice(x.segIndex + 1);
		}
		else B = Fe.slice(x.segIndex);
	}
	ps(B.filter((e) => "text" in e), o, (e) => Me(e).width + Ne(e, e.text));
	let Ie = (e) => Fo(e, Me(e).width + Ne(e, e.text), p, o), V = (t, n, r = !1) => {
		let i = r ? t.text.length - n.length : 0, a = {
			...t,
			text: n,
			punctuationCompressions: Ao(t, Math.max(0, i), Math.max(0, i) + n.length)
		};
		if (t.textLayoutService && t.textShapeRequest) return Fo(a, t.textLayoutService.shape({
			...t.textShapeRequest,
			text: n,
			fontSizePt: De(t),
			measure: !0,
			clusterGeometry: !1
		}).advancePt + Ne(t, n), p, o);
		ke(vo(t.bold, t.italic, De(t), t.fontFamily, l, t.fontRoute));
		let s = Ae(t), c = e.measureText(n).width;
		return je(s), Fo(a, c + Ne(t, n), p, o);
	}, Le = (e) => "isTab" in e ? e.measuredWidth || 0 : "imagePath" in e ? e.widthPt * o : "mathNodes" in e ? e.measuredWidth || 0 : "lineBreak" in e ? 0 : Ie(e), Re = null;
	for (me(pe ? c?.paragraphMarkLineStartWidth ?? fe() : fe()); B.length > 0;) {
		let t = B.shift();
		if ("lineBreak" in t) {
			R(t.fontSize, !0), Re = t.fontSize;
			continue;
		}
		if (Re = null, "isTab" in t) {
			if (g && !t.ptab) {
				t.measuredWidth = 0, z(t, 0, t.fontSize, t.fontSize * o * .8, t.fontSize * o * .2);
				continue;
			}
			let e = N + (ce ? r : 0);
			if (t.ptab) {
				t.resolvedAlignment = t.ptab.alignment;
				let r = t.ptab.relativeTo === "indent" ? 0 : -u, i = t.ptab.relativeTo === "indent" ? n : h, a = t.ptab.alignment === "left" ? r : t.ptab.alignment === "center" ? (r + i) / 2 : i, s = 0;
				for (let e of B) {
					if ("isTab" in e || "lineBreak" in e) break;
					s += Le(e);
				}
				let c = t.ptab.alignment === "center" ? .5 : +(t.ptab.alignment === "right"), l = a - e - s * c;
				if (l <= 0) {
					if (M.length > 0) {
						R(void 0, !1, t.src), B.unshift(t);
						continue;
					}
					l = 0;
				}
				if (t.measuredWidth = l, z(t, l, t.fontSize, t.fontSize * o * .8, t.fontSize * o * .2), t.ptab.alignment !== "left") for (; B.length > 0;) {
					let e = B[0];
					if ("isTab" in e || "lineBreak" in e) break;
					if (B.shift(), "imagePath" in e) {
						let t = e.widthPt * o;
						e.measuredWidth = t, z(e, t, e.heightPt, e.heightPt * o, 0);
					} else if ("mathNodes" in e) z(e, e.measuredWidth || 0, e.fontSize, e.mathAscent || 0, e.mathDescent || 0);
					else {
						let t = Me(e), n = Fo(e, t.width + Ne(e, e.text), p, o);
						e.measuredWidth = n;
						let r = t.fontBoundingBoxAscent ?? t.actualBoundingBoxAscent ?? e.fontSize * o * .8, i = t.fontBoundingBoxDescent ?? t.actualBoundingBoxDescent ?? e.fontSize * o * .2;
						z(e, n, e.fontSize, r, i);
					}
				}
				continue;
			}
			let i = wr(e + u, s.map((e) => ({
				pos: e.pos * o,
				alignment: e.alignment,
				leader: e.leader
			})), m * o);
			t.resolvedAlignment = i?.alignment ?? "left";
			let a = i ? i.pos - u : e, c = i ? ds(i.alignment) : "leading";
			if (i && c !== "leading") {
				let n = a;
				t.leader = i.leader;
				let r = 0;
				for (let e of B) {
					if ("isTab" in e || "lineBreak" in e) break;
					r += Le(e);
				}
				let s = c === "center" ? .5 : 1, l = n - e - r * s;
				for (l <= 0 && (l = t.fontSize * o * .25), t.measuredWidth = l, z(t, l, t.fontSize, t.fontSize * o * .8, t.fontSize * o * .2); B.length > 0;) {
					let e = B[0];
					if ("isTab" in e || "lineBreak" in e) break;
					if (B.shift(), "imagePath" in e) {
						let t = e.widthPt * o;
						e.measuredWidth = t, z(e, t, e.heightPt, e.heightPt * o, 0);
					} else if ("mathNodes" in e) z(e, e.measuredWidth || 0, e.fontSize, e.mathAscent || 0, e.mathDescent || 0);
					else {
						let t = Me(e), n = Fo(e, t.width + Ne(e, e.text), p, o);
						e.measuredWidth = n;
						let r = t.fontBoundingBoxAscent ?? t.actualBoundingBoxAscent ?? e.fontSize * o * .8, i = t.fontBoundingBoxDescent ?? t.actualBoundingBoxDescent ?? e.fontSize * o * .2;
						z(e, n, e.fontSize, r, i);
					}
				}
				continue;
			}
			let l = a - e;
			if (i && (t.leader = i.leader), l <= 0) {
				R(void 0, !1, t.src), B.unshift(t);
				continue;
			}
			if (N + l > he() && M.length > 0) {
				R(void 0, !1, t.src), B.unshift(t);
				continue;
			}
			t.measuredWidth = l, z(t, l, t.fontSize, t.fontSize * o * .8, t.fontSize * o * .2);
			continue;
		}
		if ("imagePath" in t) {
			if (t.anchor) {
				t.measuredWidth = 0;
				continue;
			}
			let e = t.widthPt * o, n = t.heightPt, r = t.heightPt * o;
			t.measuredWidth = e, M.length > 0 && N + e > he() && R(void 0, !1, t.src), z(t, e, n, r, 0);
			continue;
		}
		if ("mathNodes" in t) {
			let n = t.mathMetadata;
			if (!n || n.available === !1) {
				let n = t.fontSize * o;
				ke(vo(!1, !1, n, null, l));
				let r = e.measureText(t.fallbackText), i = r.width, a = r.fontBoundingBoxAscent ?? r.actualBoundingBoxAscent ?? n * .8, s = r.fontBoundingBoxDescent ?? r.actualBoundingBoxDescent ?? n * .2;
				t.measuredWidth = i, t.mathAscent = a, t.mathDescent = s, M.length > 0 && N + i > he() && R(void 0, !1, t.src), z(t, i, t.fontSize, Math.max(a, n * .8), Math.max(s, n * .2));
				continue;
			}
			let r = t.fontSize * o, i = n.widthEm * r, a = n.ascentEm * r, s = n.descentEm * r;
			t.measuredWidth = i, t.mathAscent = a, t.mathDescent = s;
			let c = Math.max(a, r * .8), u = Math.max(s, r * .2);
			M.length > 0 && N + i > he() && R(void 0, !1, t.src), z(t, i, t.fontSize, c, u);
			continue;
		}
		let c = t, y = Me(c), x = Fo(c, y.width + Ne(c, c.text), p, o), S = c.fontSize, D = c.fontSize * o, O = y, k = De(c);
		if (c.smallCaps && !c.vertAlign && k !== D) {
			if (c.textLayoutService && c.textShapeRequest) {
				let e = c.textLayoutService.shape({
					...c.textShapeRequest,
					text: c.text || "X",
					fontSizePt: D,
					measure: !0,
					clusterGeometry: !1
				});
				O = {
					width: e.advancePt,
					actualBoundingBoxAscent: e.ascentPt,
					actualBoundingBoxDescent: e.descentPt,
					fontBoundingBoxAscent: e.ascentPt,
					fontBoundingBoxDescent: e.descentPt
				};
			} else {
				let t = e.font;
				e.font = vo(c.bold, c.italic, D, c.fontFamily, l, c.fontRoute), O = e.measureText(c.text || "X"), e.font = t;
			}
			k = D;
		}
		let A = Vo(O, c.fontFamily, D, k, (c.metricEastAsian === !0 || Cr.test(c.text)) && !c.ruby), j = A.ascent, F = A.descent;
		if (c.ruby && (!c.textBoxLineFloor || c.textBoxVertical) && (j += io(c.ruby.fontSizePt, c.ruby.hpsRaisePt, o, c, e, l)), c.fitTextRegionIndex !== void 0) {
			if (c.fitTextRegionStart) {
				let e = x;
				for (let t of B) {
					if (!("text" in t) || t.fitTextRegionIndex !== c.fitTextRegionIndex) break;
					e += Ie(t);
				}
				M.length > 0 && N + e > he() && R(void 0, !1, c.src);
			}
			c.measuredWidth = x, z(c, x, S, j, F);
			continue;
		}
		let I = c.text.replace(/ +$/, ""), L = c.text.endsWith(" ") ? x - V(c, I) : 0, te = (e) => {
			let t = e === void 0 || "lineBreak" in e;
			return v && (!t || b);
		}, ne = (e, t, r) => Ua({
			widthPx: e,
			trailingSpacePx: t,
			lineWillJustify: te(r),
			wrapNarrowed: le !== n || ue !== 0
		}), re = ne(x, L, B[0]), ie = c.seaBreaks !== void 0 && C(c.text), ae = /* @__PURE__ */ new Set();
		Te(ae, c, I);
		let oe = (e, t, n) => te(e) ? Wa({
			biasBudgetPx: t,
			resolvedMeasurementRouteCount: Ee(n)
		}) : Se || ie ? 0 : P * ls;
		if (!c.joinPrev && M.length > 0 && B[0]?.joinPrev && !Zo(c.text) && !(c.seaBreaks && c.seaBreaks.length > 0)) {
			let e = x, t = L, n = 0, r = ee, i = new Set(ae), a = c, o = c.text, s = (e, t = e.text) => {
				r += Ce(a, o), a = e, o = t;
			};
			for (; n < B.length && B[n].joinPrev; n++) {
				let r = B[n];
				if (Zo(r.text)) {
					let n = [...r.text], a = 0;
					for (; a < n.length && E.lineStartForbidden.has(n[a].codePointAt(0));) a++;
					if (a < n.length) {
						let o = n.slice(0, a).join(""), c = V(r, o);
						e += c, o.length > 0 && (s(r, o), Te(i, r, o)), t = 0;
						break;
					}
				}
				let a = Ie(r);
				e += a, s(r), Te(i, r);
				let o = r.text.replace(/ +$/, "");
				t = r.text.endsWith(" ") ? a - V(r, o) : 0;
			}
			r += Ce(a, o.replace(/ +$/, "")), N + ne(e, t, B[n]) > he() + oe(B[n], r, i) && R(void 0, !1, c.src);
		}
		if (ie && M.length > 0 && (() => {
			let e = M[M.length - 1];
			return !("text" in e) || e.text.endsWith(" ");
		})()) {
			let e = x, t = L, n = 0, r = ee + Ce(c, I), i = new Set(ae);
			if (!c.text.endsWith(" ")) for (; n < B.length; n++) {
				let a = B[n];
				if (!("text" in a) || a.seaBreaks === void 0 || !C(a.text)) break;
				let o = a, s = Ie(o), c = o.text.replace(/ +$/, "");
				if (e += s, t = o.text.endsWith(" ") ? s - V(o, c) : 0, r += Ce(o, c), Te(i, o, c), o.text.endsWith(" ")) {
					n++;
					break;
				}
			}
			let a = ne(e, t, B[n]);
			N + a > he() + oe(B[n], r, i) && a <= le && R(void 0, !1, c.src);
		}
		let se = oe(B[0], ee + Ce(c, I), ae), de = [...I], fe = de.at(-1), pe = de.slice(0, -1).join(""), me = T && fe !== void 0 && (M.length > 0 || pe.length > 0) && Ha(fe, c.eastAsiaLanguage) && N + V(c, pe) <= he() + se;
		if (N + re <= he() + se) c.measuredWidth = x, z(c, x, S, j, F, L);
		else if (me) c.measuredWidth = x, z(c, x, S, j, F, L);
		else if (Zo(c.text) && c.seaBreaks === void 0) {
			let t = he() - N;
			ke(vo(c.bold, c.italic, De(c), c.fontFamily, l, c.fontRoute));
			let n = Ae(c), r = "";
			try {
				r = t > 0 ? rs(e, c.text, t, Eo(c, p), No(c), Do(c, o), c.verticalRun === !0, w, (e) => V(c, e)) : "";
			} finally {
				je(n);
			}
			let i = [...c.text], a = [...r].length, s = M.length > 0 ? 0 : 1, u = ns(i, (T && a < i.length && (M.length > 0 || a > 0) && Ha(i[a], c.eastAsiaLanguage) ? a + 1 : null) ?? _(i, a, f, s)), m = i.slice(0, u).join("");
			if (m.length > 0) {
				let e = V(c, m);
				z({
					...c,
					text: m,
					measuredWidth: e,
					punctuationCompressions: Ao(c, 0, m.length)
				}, e, S, j, F);
				let t = c.text.slice(m.length);
				t && B.unshift({
					...c,
					text: t,
					punctuationCompressions: Ao(c, m.length, c.text.length),
					measuredWidth: 0,
					src: {
						segIndex: c.src.segIndex,
						charOffset: c.src.charOffset + m.length
					}
				});
			} else if (M.length > 0) {
				let e = null, t = c.text.codePointAt(0), n = M[M.length - 1];
				if (t !== void 0 && f.lineStartForbidden.has(t) && "text" in n) {
					let t = n, r = [...t.text], i = d(r, f, M.length > 1 ? 0 : 1);
					if (i > 0) {
						let n = r.slice(0, r.length - i).join(""), a = r.slice(r.length - i).join("");
						if (e = {
							...t,
							text: a,
							punctuationCompressions: Ao(t, n.length, t.text.length),
							measuredWidth: V(t, a, !0),
							src: {
								segIndex: t.src.segIndex,
								charOffset: t.src.charOffset + n.length
							}
						}, n) {
							let e = V(t, n);
							N -= t.measuredWidth - e, M[M.length - 1] = {
								...t,
								text: n,
								measuredWidth: e,
								punctuationCompressions: Ao(t, 0, n.length)
							};
						} else N -= t.measuredWidth, M.pop();
					}
				}
				R(void 0, !1, e?.src ?? c.src), B.unshift(c), e && B.unshift(e);
			} else {
				let e = [...c.text], t = e.length > 0 ? ns(e, 1) : 0, n = e.slice(0, t).join("");
				if (n) {
					let e = V(c, n);
					z({
						...c,
						text: n,
						measuredWidth: e,
						punctuationCompressions: Ao(c, 0, n.length)
					}, e, S, j, F);
					let t = c.text.slice(n.length);
					t && B.unshift({
						...c,
						text: t,
						punctuationCompressions: Ao(c, n.length, c.text.length),
						measuredWidth: 0,
						src: {
							segIndex: c.src.segIndex,
							charOffset: c.src.charOffset + n.length
						}
					});
				}
			}
		} else if (c.seaBreaks !== void 0) {
			let e = he() - N, t = (e) => V(c, e), n = ge(c.text), r = a(c.text, c.seaBreaks, 0, e, t, n);
			if (r > 0) {
				let e = c.text.slice(0, r), t = V(c, e);
				z({
					...c,
					text: e,
					measuredWidth: t,
					punctuationCompressions: Ao(c, 0, e.length)
				}, t, S, j, F);
				let n = c.text.slice(r);
				n && B.unshift({
					...c,
					text: n,
					punctuationCompressions: Ao(c, r, c.text.length),
					measuredWidth: 0,
					src: {
						segIndex: c.src.segIndex,
						charOffset: c.src.charOffset + r
					},
					seaBreaks: ts(c.seaBreaks, r)
				});
			} else if (M.length > 0) {
				let e = null, t = c.text.codePointAt(0), n = M[M.length - 1];
				if (t !== void 0 && f.lineStartForbidden.has(t) && "text" in n) {
					let t = n, r = [...t.text], i = d(r, f, M.length > 1 ? 0 : 1);
					if (i > 0) {
						let n = r.slice(0, r.length - i).join(""), a = r.slice(r.length - i).join("");
						if (e = {
							...t,
							text: a,
							punctuationCompressions: Ao(t, n.length, t.text.length),
							measuredWidth: V(t, a, !0),
							src: {
								segIndex: t.src.segIndex,
								charOffset: t.src.charOffset + n.length
							},
							seaBreaks: ts(t.seaBreaks, n.length)
						}, n) {
							let e = V(t, n);
							N -= t.measuredWidth - e, M[M.length - 1] = {
								...t,
								text: n,
								measuredWidth: e,
								punctuationCompressions: Ao(t, 0, n.length)
							};
						} else N -= t.measuredWidth, M.pop();
					}
				}
				R(void 0, !1, e?.src ?? c.src), B.unshift(c), e && B.unshift(e);
			} else {
				let r = c.seaBreaks[0] ?? c.text.length, o = c.text.slice(0, r), s = i(o), l = a(o, s, 0, e, t, n);
				l <= 0 && (l = s.length > 0 ? s[0] : o.length);
				let u = c.text.slice(0, l), d = V(c, u);
				z({
					...c,
					text: u,
					measuredWidth: d,
					punctuationCompressions: Ao(c, 0, u.length)
				}, d, S, j, F);
				let f = c.text.slice(l);
				f && B.unshift({
					...c,
					text: f,
					punctuationCompressions: Ao(c, l, c.text.length),
					measuredWidth: 0,
					src: {
						segIndex: c.src.segIndex,
						charOffset: c.src.charOffset + l
					},
					seaBreaks: ts(c.seaBreaks, l)
				});
			}
		} else if (M.length === 0) {
			let t = he();
			ke(vo(c.bold, c.italic, De(c), c.fontFamily, l, c.fontRoute));
			let n = Ae(c), r = 0;
			try {
				r = t > 0 ? rs(e, c.text, t, Eo(c, p), No(c), Do(c, o), c.verticalRun === !0, w, (e) => V(c, e)).length : 0;
			} finally {
				je(n);
			}
			let a = [
				0,
				...i(c.text),
				c.text.length
			], s = a.filter((e) => e <= r).at(-1) ?? 0;
			for (s <= 0 && (s = a[1] ?? c.text.length); c.text.startsWith("　", s);) s += 1;
			if (s >= c.text.length) c.measuredWidth = x, z(c, x, S, j, F);
			else {
				let e = c.text.slice(0, s), t = V(c, e);
				z({
					...c,
					text: e,
					measuredWidth: t,
					punctuationCompressions: Ao(c, 0, e.length)
				}, t, S, j, F), B.unshift({
					...c,
					text: c.text.slice(s),
					punctuationCompressions: Ao(c, s, c.text.length),
					measuredWidth: 0,
					src: {
						segIndex: c.src.segIndex,
						charOffset: c.src.charOffset + e.length
					}
				});
			}
		} else {
			if (c.joinPrev) {
				c.measuredWidth = x, z(c, x, S, j, F, L);
				continue;
			}
			R(void 0, !1, c.src), B.unshift(c);
		}
	}
	if (M.length > 0 ? R() : Re !== null && R(Re), S === "bounded") for (let e of j) for (let t of e.segments) !("text" in t) || t.metricOnly || t.text.length === 0 || (t.shapedClusters = void 0, t.textLayoutService && t.textShapeRequest && Me(t, !0));
	return j;
}
//#endregion
//#region packages/docx/src/bidi-line.ts
var gs = (e) => {
	let t = e.text;
	return typeof t == "string" ? t : void 0;
}, _s = (e) => e.rtl === !0, vs = (e) => e.digitsAsAN === !0, ys = (e) => "isTab" in e;
function bs(e) {
	for (let t of e) {
		if (_s(t)) return !0;
		let e = gs(t);
		if (e !== void 0 && N(e)) return !0;
	}
	return !1;
}
function xs(e, n) {
	let r = e.length;
	if (r === 0) return {
		order: [],
		rtl: []
	};
	let i = "", a = Array(r), o = Array(r), s, c = () => {
		for (s ||= []; s.length < i.length;) s.push(null);
		return s;
	};
	for (let t = 0; t < r; t++) {
		let n = gs(e[t]) ?? "";
		if (a[t] = i.length, i += n.length > 0 ? n : "￼", o[t] = i.length, ys(e[t])) c()[a[t]] = "S";
		else if (n.length > 0 && (vs(e[t]) || _s(e[t]))) {
			let n = c(), r = vs(e[t]), s = _s(e[t]);
			for (let e = a[t]; e < o[t]; e++) {
				let t = i.charCodeAt(e);
				r && t >= 48 && t <= 57 ? n[e] = "AN" : s && to(i[e]) && (n[e] = "R");
			}
		}
	}
	if (s) for (; s.length < i.length;) s.push(null);
	let { levels: u, paragraphLevel: d } = l().computeLevels(i, n ? "rtl" : "ltr", s), f = Array(r), p = Array(r);
	for (let e = 0; e < r; e++) {
		let t = o[e];
		for (; t > a[e] && i[t - 1] === " ";) t--;
		let n = !1;
		for (let r = a[e]; r < t; r++) {
			let e = u[r];
			if (e !== 255 && (e & 1) == 1) {
				n = !0;
				break;
			}
		}
		f[e] = n, p[e] = a[e];
		for (let r = a[e]; r < t; r++) {
			let t = u[r];
			if (t !== 255 && (t & 1) == 1 === n) {
				p[e] = r;
				break;
			}
		}
	}
	let { order: m } = t(u, d, p);
	return {
		order: m,
		rtl: f
	};
}
function Ss(e, t) {
	switch (e) {
		case "center": return "center";
		case "both":
		case "justify":
		case "distribute":
		case "lowKashida":
		case "mediumKashida":
		case "highKashida":
		case "thaiDistribute": return "justify";
		case "end":
		case "right": return t ? "left" : "right";
		case "start":
		case "left":
		case void 0:
		default: return t ? "right" : "left";
	}
}
function Cs(e) {
	switch (e) {
		case "both":
		case "justify":
		case "distribute":
		case "lowKashida":
		case "mediumKashida":
		case "highKashida":
		case "thaiDistribute": return !0;
		default: return !1;
	}
}
function ws(e) {
	return e === "distribute";
}
//#endregion
//#region packages/docx/src/layout/numbering-marker.ts
function Ts(e) {
	let t = e.leadingIndentPt + e.authoredFirstIndentPt + e.markerShiftPt;
	return {
		startPt: t,
		endPt: t + e.markerWidthPt
	};
}
function Es(e) {
	let t = e.authoredFirstIndentPt + e.markerShiftPt;
	return e.baseRtl ? e.alignedLeadingEdgePt - t - e.markerWidthPt : e.alignedLeadingEdgePt + t;
}
function Ds(e, t) {
	let { numbering: n, markerInput: r, service: i } = t, a = n != null && (n.text !== "" || n.picBulletImagePath != null) && (!e.baseRtl || (n?.suff || "tab") === "tab" && t.authoredFirstIndentPt < 0);
	if (!n || !r || !i || !a) return e;
	let o = As(n, r, {
		authoredFirstIndentPt: t.authoredFirstIndentPt,
		physicalIndentLeftPt: e.physicalIndentLeftPt,
		tabStops: t.tabStops,
		defaultTabPt: t.defaultTabPt ?? e.defaultTabPt
	}, i, t.clusterGeometry ?? !0);
	return {
		...e,
		firstIndentPt: o.bodyOffsetPt,
		numberingMarkerGeometry: o
	};
}
function Os(e, t, n, r, i = !0) {
	return r ? {
		shape: r.shape({
			text: t,
			fontSizePt: e.fontSizePt * n,
			fonts: e.fonts,
			themeFonts: e.themeFonts,
			themeFontPresence: e.themeFontPresence,
			weight: e.weight,
			style: e.style,
			complexScript: e.complexScript,
			fontHint: e.fontHint,
			eastAsiaLanguage: e.eastAsiaLanguage,
			kerning: e.kerning,
			measure: !0,
			clusterGeometry: i
		}),
		fontSizePx: e.fontSizePt * n
	} : null;
}
function ks(e, t, n) {
	return t.find((t) => Ga(e, t)) ?? wr(e, [...t], n);
}
function As(e, t, n, r, i = !0) {
	let a = e.picBulletImagePath ? "" : He(e.text, e.fontFamily ?? null), o = a ? Os(t, a, 1, r, i)?.shape ?? null : null, s = e.picBulletImagePath ? e.picBulletWidthPt ?? t.fontSizePt : o?.advancePt ?? 0, c = e.jc === "right" ? -s : e.jc === "center" ? -s / 2 : 0, l = n.authoredFirstIndentPt + c + s, u = e.suff || "tab", d = l;
	if (u === "space") d += Os(t, " ", 1, r, i)?.shape.advancePt ?? 0;
	else if (u === "tab" && (d = 0, l > 0)) {
		let e = ks(n.physicalIndentLeftPt + l, n.tabStops, n.defaultTabPt);
		d = e ? e.pos - n.physicalIndentLeftPt : l;
	}
	return {
		bodyOffsetPt: d,
		markerText: a,
		markerWidthPt: s,
		markerShiftPt: c,
		shape: o
	};
}
//#endregion
//#region packages/docx/src/layout/intrinsic-width.ts
function js(e, t, n) {
	let r = 0, i = 0;
	for (let t of e.content) {
		let e = t.type === "paragraph" ? n.paragraph(t) : n.nestedTable(t);
		r = Math.max(r, e.minWidthPt), i = Math.max(i, e.maxWidthPt);
	}
	let a = Math.max(0, t.left) + Math.max(0, t.right);
	return {
		minWidthPt: r + a,
		maxWidthPt: Math.max(r, i) + a
	};
}
function Ms(e) {
	let t = e.textShapeRequest, n = (e) => e ? [
		e.ascii ?? null,
		e.highAnsi ?? null,
		e.eastAsia ?? null,
		e.complexScript ?? null
	] : null;
	return On("paragraph-intrinsic-text", [
		e.textLayoutService?.fingerprint ?? null,
		t ? [
			n(t.fonts),
			n(t.themeFonts),
			t.themeFontPresence ? [
				t.themeFontPresence.ascii ?? !1,
				t.themeFontPresence.highAnsi ?? !1,
				t.themeFontPresence.eastAsia ?? !1,
				t.themeFontPresence.complexScript ?? !1
			] : null,
			t.fontHint ?? null,
			t.fontSizePt,
			t.weight ?? null,
			t.style ?? null,
			t.complexScript ?? !1,
			t.eastAsiaLanguage ?? null,
			t.eastAsiaFontCharset ?? null,
			t.genericFamily ?? null,
			t.letterSpacingPt ?? null,
			t.kerning ?? null
		] : null,
		e.bold,
		e.italic,
		Sr(e, 1),
		e.fontFamily,
		e.fontRoute ?? null,
		e.charScale ?? 1,
		e.charSpacing ?? 0,
		e.fitTextPerGapPx ?? null,
		e.fitTextTrailingPadPx ?? null,
		e.fitTextRegionIndex ?? null,
		e.snapToCharacterGrid !== !1,
		e.tateChuYoko ?? !1,
		e.tateChuYoko ? e.sourceRunIndex ?? null : null,
		e.ruby ? [
			e.sourceRunIndex ?? null,
			e.ruby.text,
			e.ruby.fontSizePt,
			e.ruby.hpsRaisePt ?? null
		] : null,
		e.verticalRun ?? !1
	]);
}
function Ns(e) {
	let t = [];
	for (let n of e) {
		let e = t.at(-1);
		if (e && "text" in e && "text" in n && Ms(e) === Ms(n)) {
			let r = e.text.length, i = e.text + n.text, a = [...e.punctuationCompressions ?? [], ...(n.punctuationCompressions ?? []).map((e) => ({
				end: r + e.end,
				adjustmentPt: e.adjustmentPt
			}))];
			t[t.length - 1] = {
				...e,
				text: i,
				punctuationCompressions: a.length > 0 ? a : void 0,
				textShapeRequest: e.textShapeRequest ? {
					...e.textShapeRequest,
					text: i
				} : void 0
			};
			continue;
		}
		t.push({ ...n });
	}
	return t;
}
function Ps(e, t, n, r, i, a) {
	let o = 0;
	for (let s of e) {
		let e = Math.max(n, s.start), c = Math.min(r, s.end);
		if (e >= c) continue;
		let l = t.slice(e, c), u = e - s.start, d = c - s.start, f = {
			...s.segment,
			text: l,
			punctuationCompressions: Ao(s.segment, u, d)
		};
		if (f.textLayoutService && f.textShapeRequest) {
			let e = f.textLayoutService.shape({
				...f.textShapeRequest,
				text: l,
				fontSizePt: Sr(f, 1),
				measure: !0,
				clusterGeometry: !1
			});
			o += Fo(f, e.advancePt, a, 1);
			continue;
		}
		i.context.font = vo(f.bold, f.italic, Sr(f, 1), f.fontFamily, i.fontFamilyClasses, f.fontRoute), o += Fo(f, i.context.measureText(l).width, a, 1);
	}
	return o;
}
function Fs(e, t, n) {
	let r = t.characterGrid.active ? t.characterGrid.deltaPt : 0, a = 0;
	for (let o = 0; o < e.length; o += 1) {
		let s = e[o];
		if (!("text" in s) || s.text.length === 0) continue;
		let c = [], l = "", u = (e) => {
			let t = l.length;
			l += e.text, c.push({
				segment: e,
				start: t,
				end: l.length
			});
		};
		for (u(s); o + 1 < e.length;) {
			let t = e[o + 1];
			if (!("text" in t) || t.joinPrev !== !0) break;
			u(t), o += 1;
		}
		let d = 0;
		for (let e of cs(l)) {
			let o = e.replace(/\s+$/u, ""), s = d, u = d + o.length;
			if (d += e.length, !o) continue;
			if (!Zo(o)) {
				a = Math.max(a, Ps(c, l, s, u, n, r));
				continue;
			}
			let f = [
				0,
				...i(o),
				o.length
			], p = [];
			for (let e = 1; e < f.length; e += 1) p.push({
				text: o.slice(f[e - 1], f[e]),
				start: s + f[e - 1],
				end: s + f[e]
			});
			let m = [], h = p[0];
			for (let e = 1; e < p.length; e += 1) {
				let n = [...h.text].at(-1)?.codePointAt(0), r = p[e].text.codePointAt(0);
				n !== void 0 && r !== void 0 && !t.kinsoku.lineEndForbidden.has(n) && !t.kinsoku.lineStartForbidden.has(r) ? (m.push(h), h = p[e]) : h = {
					text: h.text + p[e].text,
					start: h.start,
					end: p[e].end
				};
			}
			h && m.push(h);
			for (let e of m) a = Math.max(a, Ps(c, l, e.start, e.end, n, r));
		}
	}
	return a;
}
function Is(e, t, n) {
	let r = (n.baseRtl ? n.physicalIndentRightPt : n.physicalIndentLeftPt) + (t === 0 ? n.firstIndentPt : 0) + e.xOffset;
	return {
		startPt: r,
		endPt: r + e.segments.reduce((e, t) => e + t.measuredWidth, 0)
	};
}
function Ls(e, t, n, r, i, a) {
	if (!Number.isFinite(n) || n < 0) throw RangeError("maximumWidthPt must be finite and non-negative");
	if (n === 0) return {
		minWidthPt: 0,
		maxWidthPt: 0
	};
	let o = Ns(ms(e.runs, i)), s = Math.max(1, n - t.physicalIndentLeftPt - t.physicalIndentRightPt), c = o.length === 0 ? [] : hs(r.context, o, s, t.firstIndentPt, 1, [...t.tabStops], void 0, r.fontFamilyClasses, t.physicalIndentLeftPt, t.kinsoku, t.characterGrid.active ? t.characterGrid.deltaPt : 0, t.defaultTabPt, s + t.physicalIndentRightPt, t.baseRtl, t.isJustified, t.stretchLastLine, void 0, "intrinsic", i.verticalGlyphMeasurement, t.overflowPunct !== !1), l = t.baseRtl ? t.physicalIndentLeftPt : t.physicalIndentRightPt, u = 0, d = 0;
	c.forEach((e, n) => {
		let r = Is(e, n, t);
		u = Math.min(u, r.startPt), d = Math.max(d, r.endPt);
	});
	let f = a ? Ts({
		leadingIndentPt: t.baseRtl ? t.physicalIndentRightPt : t.physicalIndentLeftPt,
		authoredFirstIndentPt: e.indentFirst,
		markerShiftPt: a.markerShiftPt,
		markerWidthPt: a.markerWidthPt
	}) : void 0;
	f && (u = Math.min(u, f.startPt), d = Math.max(d, f.endPt));
	let p = Math.min(n, Math.max(0, d - u + l)), m = Fs(o, t, r);
	for (let e of c) {
		let t = 0, n = e.segments.reduce((e, t) => e + t.measuredWidth, 0);
		for (let r of e.segments) t += r.measuredWidth, "imagePath" in r && !r.anchor || "mathNodes" in r ? m = Math.max(m, r.measuredWidth) : "isTab" in r && (m = Math.max(m, r.resolvedAlignment === "left" ? t : n));
	}
	let h = t.baseRtl ? t.physicalIndentRightPt : t.physicalIndentLeftPt, g = h, _ = Math.min(0, g), v = Math.max(0, g + m), y = h + t.firstIndentPt;
	return _ = Math.min(_, y), v = Math.max(v, y + m), f && (_ = Math.min(_, f.startPt), v = Math.max(v, f.endPt)), {
		minWidthPt: Math.min(n, Math.max(0, v - _ + l)),
		maxWidthPt: p
	};
}
//#endregion
//#region packages/docx/src/layout/paragraph-border-adjacency.ts
function Rs(e, t) {
	if (!e || t?.suppressBottom) return 0;
	let n = e.bottom;
	return !n || n.style === "none" ? 0 : (n.space ?? 0) + (n.width ?? 0) / 2;
}
function zs(e) {
	return e == null || e.style === "none" ? null : e;
}
function Bs(e, t) {
	let n = zs(e), r = zs(t);
	return n == null || r == null ? n == null && r == null : n.style === r.style && n.width === r.width && (n.space ?? 0) === (r.space ?? 0) && (n.color ?? null) === (r.color ?? null);
}
function Vs(e, t) {
	return !e || !t ? !1 : Bs(e.top, t.top) && Bs(e.bottom, t.bottom) && Bs(e.left, t.left) && Bs(e.right, t.right) && Bs(e.between, t.between);
}
function Hs(e) {
	return e ? [
		e.top,
		e.right,
		e.bottom,
		e.left,
		e.between
	].some((e) => e != null && e.style !== "none") : !1;
}
function Us(e, t) {
	return !e || !t || e.framePr || t.framePr ? !1 : Hs(e.borders) && Hs(t.borders) && Vs(e.borders, t.borders);
}
function Ws(e, t, n, r = !1) {
	let i = (e, t) => r ? !!e && !!t && !!e.framePr && !!t.framePr && Hs(e.borders) && Hs(t.borders) && Vs(e.borders, t.borders) : Us(e, t), a = i(e, t), o = i(t, n), s = t.borders?.between;
	return Object.freeze({
		top: a ? s && s.style !== "none" ? "between" : "none" : "top",
		bottom: o ? "none" : "bottom"
	});
}
//#endregion
//#region packages/docx/src/layout/frame.ts
function Gs(e, t, n, r, i, a) {
	return Ls(e, t, n, r, i, a).maxWidthPt;
}
function Ks(e) {
	let t = e;
	return On("w:framePr", [
		t.dropCap,
		t.lines,
		t.wrap,
		t.hAnchor,
		t.vAnchor,
		t.hRule,
		t.hSpace,
		t.vSpace,
		t.w ?? null,
		t.h ?? null,
		t.x ?? null,
		t.y ?? null,
		t.xAlign ?? null,
		t.yAlign ?? null,
		t.__anchorLock === !0
	]);
}
function qs(e) {
	let t = /* @__PURE__ */ new WeakMap();
	for (let n = 0; n < e.length;) {
		let r = e[n];
		if (r?.type !== "paragraph" || !r.framePr) {
			n += 1;
			continue;
		}
		let i = Ks(r.framePr), a = [r], o = [n], s = n + 1;
		for (; s < e.length;) {
			let t = e[s];
			if (t?.type !== "paragraph" || !t.framePr || Ks(t.framePr) !== i) break;
			a.push(t), o.push(s), s += 1;
		}
		let c = Object.freeze({
			id: `${i}:${n}`,
			owner: r,
			members: Object.freeze(a),
			sourceIndices: Object.freeze(o),
			framePr: r.framePr
		});
		for (let e of a) t.set(e, c);
		n = s;
	}
	return t;
}
var Js = /* @__PURE__ */ new WeakMap(), Ys = /* @__PURE__ */ new WeakMap();
function Xs(e) {
	let t = qs(e);
	for (let n = 0; n < e.length; n += 1) {
		let r = e[n];
		if (r.type !== "paragraph") continue;
		let i = t.get(r);
		i && Js.set(r, i);
		let a = e[n - 1], o = e[n + 1], s = a?.type === "paragraph" && t.get(a) === i ? a : null, c = o?.type === "paragraph" && t.get(o) === i ? o : null;
		Ys.set(r, Ws(i ? s : a?.type === "paragraph" ? a : null, r, i ? c : o?.type === "paragraph" ? o : null, i !== void 0));
	}
}
var Zs = (e) => Js.get(e), Qs = (e) => Ys.get(e);
//#endregion
//#region packages/docx/src/layout-context.ts
function $s(e) {
	return {
		story: e.story,
		containers: [...e.containers, { kind: "tableCell" }],
		lineNumberingEligible: !1
	};
}
function ec(e) {
	return e.runs.some((e) => e.type === "text" && !!e.ruby);
}
function tc(e) {
	return e.runs.some((e) => e.type === "text" && Cr.test(e.text));
}
function nc(e) {
	for (let t of e) {
		if (t.type === "paragraph") {
			if (tc(t)) return !0;
			continue;
		}
		if (t.type === "table") {
			for (let e of t.rows) for (let t of e.cells) if (nc(t.content)) return !0;
		}
	}
	return !1;
}
function rc(e) {
	return Xs(e.body), {
		kinsoku: Le(e.settings),
		defaultTabPt: us(e.settings),
		characterSpacingControl: e.settings?.characterSpacingControl,
		mathDefJc: e.settings?.mathDefJc,
		documentHasEastAsianText: nc(e.body),
		compat: {
			adjustLineHeightInTable: e.settings?.adjustLineHeightInTable ?? !1,
			useFeLayout: e.settings?.useFeLayout ?? !1,
			balanceSingleByteDoubleByteWidth: e.settings?.balanceSingleByteDoubleByteWidth ?? !1
		}
	};
}
function ic(e) {
	let t = e.pageWidth - e.marginLeft - e.marginRight, n = e.columns;
	if (!n || n.count <= 1) return [{
		xPt: e.marginLeft,
		wPt: Math.max(1, t)
	}];
	if (!n.equalWidth && n.cols.length > 0) {
		let t = [], r = e.marginLeft;
		for (let e of n.cols) t.push({
			xPt: r,
			wPt: Math.max(1, e.widthPt)
		}), r += e.widthPt + e.spacePt;
		return t;
	}
	let r = Math.max(1, (t - (n.count - 1) * n.spacePt) / n.count);
	return Array.from({ length: n.count }, (t, i) => ({
		xPt: e.marginLeft + i * (r + n.spacePt),
		wPt: r
	}));
}
function ac(e) {
	switch (e) {
		case "lines":
		case "linesAndChars":
		case "snapToChars": return e;
		default: return "none";
	}
}
function oc(e) {
	return e === "lines" || e === "linesAndChars" || e === "snapToChars";
}
function sc(e) {
	return e === "linesAndChars" || e === "snapToChars";
}
function cc(e, t) {
	return {
		geometry: {
			pageWidth: t.pageWidth,
			pageHeight: t.pageHeight,
			marginTop: t.marginTop,
			marginRight: t.marginRight,
			marginBottom: t.marginBottom,
			marginLeft: t.marginLeft,
			headerDistance: t.headerDistance,
			footerDistance: t.footerDistance
		},
		columns: ic(t),
		columnSeparator: t.columns?.sep === !0,
		grid: {
			kind: ac(t.docGridType),
			linePitchPt: t.docGridLinePitch ?? null,
			charSpacePt: t.docGridCharSpace == null ? null : t.docGridCharSpace / 4096
		},
		textDirection: t.textDirection ?? "lrTb",
		sectionBidi: !1,
		verticalAlignment: t.vAlign ?? "top",
		lineNumbering: t.lineNumbering ?? void 0
	};
}
function lc(e) {
	return e.containers.some((e) => e.kind === "tableCell");
}
function uc(e, t, n, r) {
	let i = oc(t.grid.kind) && t.grid.linePitchPt != null && t.grid.linePitchPt > 0 && r.snapToGrid !== !1 && r.lineSpacing?.rule !== "exact" && (!lc(n) || e.compat.adjustLineHeightInTable), a = sc(t.grid.kind) && t.grid.charSpacePt != null, o = r.bidi === !0, s = r.numbering, c = s != null && (s.text !== "" || s.picBulletImagePath != null), l = o && c && (s.suff || "tab") === "tab" && r.indentFirst < 0;
	return {
		lineGrid: {
			active: i,
			pitchPt: i ? t.grid.linePitchPt : null
		},
		characterGrid: {
			active: a,
			deltaPt: a ? t.grid.charSpacePt ?? 0 : 0
		},
		physicalIndentLeftPt: o ? r.indentRight : r.indentLeft,
		physicalIndentRightPt: o ? r.indentLeft : r.indentRight,
		firstIndentPt: l ? 0 : r.indentFirst,
		lineSpacing: r.lineSpacing,
		spaceBeforePt: r.spaceBefore,
		spaceAfterPt: r.spaceAfter,
		baseRtl: o,
		isJustified: Cs(r.alignment),
		stretchLastLine: ws(r.alignment),
		tabStops: [...r.tabStops],
		hasRuby: ec(r),
		hasEastAsianText: tc(r),
		kinsoku: e.kinsoku,
		defaultTabPt: e.defaultTabPt,
		overflowPunct: r.overflowPunct !== !1,
		mathDefJc: e.mathDefJc
	};
}
K({
	id: "word-default-line-number-distance",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/compatibility.test.ts#uses Word's observed 18pt line-number distance only when omitted"
	},
	description: "ECMA-376 §17.6.8 leaves an omitted line-number distance implementation-defined. Preserve Word-compatible 18pt placement only when the authored distance is absent."
}), K({
	id: "word-continuous-section-page-number-restart",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/page-number-field-render.test.ts#restarts a spilling continuous section after its shared first page"
	},
	description: "Issue #804 records that Word anchors a continuous section page-number restart to the section first appearance on the shared physical page, so its next owned page advances from that appearance."
}), K({
	id: "word-trailing-empty-mark-baseline-admission",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/paginate-trailing-empty-mark-fit.test.ts#KEEPS an inkless empty paragraph on the page when ink-bearing content follows and only its below-baseline whitespace overflows"
	},
	description: "At the unreserved physical body edge, Word admits an undecorated non-terminal empty paragraph mark by its baseline when later ink follows in the same flow."
}), K({
	id: "word-book-fold-gutter-right-edge",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §§2.1.389, 2.1.391"
	},
	description: "For book-fold printing Word places the automatic gutter at the right-margin bisector edge, including reverse book-fold mode."
});
function dc(e) {
	return e ?? 18;
}
function fc(e, t, n) {
	return e + t - n;
}
function pc(e) {
	return !e.hasContinuationBoundary && e.inkless && e.undecorated && !e.keepNext && e.markReservePt === 0 && e.pageBottomIsUnreserved && e.physicalRegionBottomIsActive && e.hasFollowingInk ? e.markBelowBaselinePt : 0;
}
function mc() {
	return "right";
}
//#endregion
//#region packages/docx/src/layout/context.ts
function hc(e) {
	if (e.sectionOccurrenceId.length === 0) throw RangeError("Section occurrence id must not be empty");
	if (e.columns.length === 0) throw RangeError("A page-flow section requires at least one column");
	return Object.freeze({
		sectionOccurrenceId: e.sectionOccurrenceId,
		geometry: Object.freeze({ ...e.geometry }),
		columns: Object.freeze(e.columns.map((e) => Object.freeze({ ...e }))),
		textDirection: e.textDirection,
		sectionBidi: e.sectionBidi ?? !1,
		grid: Object.freeze(e.grid ?? {
			kind: "none",
			linePitchPt: null,
			charSpacePt: null
		})
	});
}
function gc(e) {
	return vc(e.geometry.marginTop);
}
function _c(e) {
	return e.geometry.pageHeight - vc(e.geometry.marginBottom);
}
function vc(e) {
	return Math.abs(e);
}
function yc(e) {
	return {
		pageWidth: e.pageHeight,
		pageHeight: e.pageWidth,
		marginLeft: e.marginTop,
		marginTop: e.marginRight,
		marginRight: e.marginBottom,
		marginBottom: e.marginLeft,
		headerDistance: e.headerDistance,
		footerDistance: e.footerDistance
	};
}
function bc(e) {
	return {
		pageWidth: e.pageHeight,
		pageHeight: e.pageWidth,
		marginTop: e.marginLeft,
		marginRight: e.marginTop,
		marginBottom: e.marginRight,
		marginLeft: e.marginBottom,
		headerDistance: e.headerDistance,
		footerDistance: e.footerDistance
	};
}
function xc(e) {
	return e === "tbRl" || e === "tbRlV" || e === "tbLrV" || e === "btLr";
}
function Sc(e, t) {
	if (!Number.isInteger(t) || t < 0) throw RangeError("Physical page index must be a non-negative integer");
	let { pageWidth: n, pageHeight: r } = e.physicalGeometry, { marginTop: i, marginRight: a, marginBottom: o, marginLeft: s } = e.physicalGeometry, c = e.bookFoldPrinting || e.bookFoldRevPrinting;
	return c ? (n /= 2, mc() === "right" && (a += e.gutterPt)) : e.printTwoOnOne ? (r /= 2, i += e.gutterPt) : e.gutterAtTop && !e.mirrorMargins ? i += e.gutterPt : e.rtlGutter ? a += e.gutterPt : s += e.gutterPt, !c && !e.printTwoOnOne && e.mirrorMargins && t % 2 == 1 && ([s, a] = [a, s]), {
		...e.physicalGeometry,
		pageWidth: n,
		pageHeight: r,
		marginTop: i,
		marginRight: a,
		marginBottom: o,
		marginLeft: s
	};
}
function Cc(e, t, n) {
	let r = Sc(t, n), i = xc(t.textDirection) ? yc(r) : r;
	return Object.freeze({
		...e,
		geometry: Object.freeze(i),
		columns: Object.freeze(ic({
			...i,
			titlePage: !1,
			evenAndOddHeaders: !1,
			columns: t.columns
		}).map((e) => Object.freeze(e)))
	});
}
function wc(e) {
	return {
		pageWidth: e.pageWidth,
		pageHeight: e.pageHeight,
		marginTop: e.marginTop,
		marginRight: e.marginRight,
		marginBottom: e.marginBottom,
		marginLeft: e.marginLeft,
		headerDistance: e.headerDistance,
		footerDistance: e.footerDistance
	};
}
function Tc(e, t = !1) {
	let n = e.docGridType === "lines" || e.docGridType === "linesAndChars" || e.docGridType === "snapToChars" ? e.docGridType : "none";
	return Object.freeze({
		geometry: Object.freeze(wc(e)),
		columns: Object.freeze(ic(e).map((e) => Object.freeze(e))),
		columnSeparator: e.columns?.sep === !0,
		grid: Object.freeze({
			kind: n,
			linePitchPt: e.docGridLinePitch ?? null,
			charSpacePt: e.docGridCharSpace == null ? null : e.docGridCharSpace / 4096
		}),
		textDirection: e.textDirection ?? "lrTb",
		sectionBidi: t,
		verticalAlignment: e.vAlign ?? "top",
		...e.lineNumbering === null || e.lineNumbering === void 0 ? {} : { lineNumbering: Object.freeze({ ...e.lineNumbering }) }
	});
}
function Ec(e) {
	if (!Number.isInteger(e.bodyLength) || e.bodyLength < 0 || e.occurrences.length === 0) throw RangeError("A body section index requires a non-negative length and occurrences");
	let t = Array(e.bodyLength + 1), n = 0;
	e.occurrences.forEach((r, i) => {
		let a = i === e.occurrences.length - 1;
		if (r.ordinal !== i || r.startBodyIndex !== n || r.endBodyIndex !== (a ? e.bodyLength - 1 : r.markerBodyIndex) || r.final !== a || (a ? r.markerBodyIndex !== null : r.markerBodyIndex === null)) throw RangeError(`Invalid section occurrence ${i}`);
		for (let e = r.startBodyIndex; e <= r.endBodyIndex; e += 1) t[e] = i;
		n = r.endBodyIndex + 1;
	});
	let r = e.occurrences.length - 1;
	t[e.bodyLength] = r;
	let i = Object.freeze([...e.occurrences]), a = Object.freeze(t);
	return Object.freeze({
		occurrences: i,
		sectionAtBodyIndex(e) {
			if (!Number.isInteger(e) || e < 0 || e >= a.length) throw RangeError(`Body index ${e} is outside the retained section index`);
			return i[a[e]];
		}
	});
}
//#endregion
//#region packages/docx/src/layout/adjacent-tables.ts
function Dc(e, t) {
	let n = t[0].logicalTotalRows, r = 0;
	for (let i of t) {
		if (i.logicalTotalRows !== n || !Number.isInteger(i.rowCount) || i.rowCount < 0 || i.logicalRowOffset !== r) throw Error(`Parser-owned adjacent table sequence ${e} is inconsistent`);
		r += i.rowCount;
	}
	if (r !== n) throw Error(`Parser-owned adjacent table sequence ${e} is incomplete`);
}
function Oc(e) {
	let t = [], n = null, r = [], i = () => {
		r.length > 0 && Dc(n, r), r.length === 1 ? t.push(Object.freeze({
			kind: "body-element",
			element: r[0].element
		})) : r.length > 1 && t.push(Object.freeze({
			kind: "adjacent-table-group",
			logicalSequenceId: n,
			tables: Object.freeze(r.map((e) => e.element))
		})), n = null, r = [];
	};
	for (let { element: a, table: o } of e) {
		if (a.type === "table" && o !== null) {
			r.length > 0 && n !== o.logicalSequenceId && i(), n = o.logicalSequenceId, r.push(Object.freeze({
				element: a,
				logicalRowOffset: o.logicalRowOffset,
				logicalTotalRows: o.logicalTotalRows,
				rowCount: o.rowCount
			}));
			continue;
		}
		i(), t.push(Object.freeze({
			kind: "body-element",
			element: a
		}));
	}
	return i(), Object.freeze(t);
}
K({
	id: "word-terminal-column-break",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/pagination.test.ts#ignores a terminal last-column break before a hard page boundary"
	},
	description: "The established pagination regression contract does not materialize a column transition when no body flow content occurs before the next forced page or non-continuous section boundary."
}), K({
	id: "word-pre-break-anchor-paragraph",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/pagination.test.ts#does not push an anchor-only pre-break paragraph to a new page just for its empty mark"
	},
	description: "The established pagination regression contract keeps an anchor-only paragraph immediately before an authored page break in the pre-break flow region without charging its otherwise visible paragraph mark."
}), K({
	id: "word-pre-break-inline-drawing-group",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/pagination.test.ts#moves a preceding image with its pre-break callout when the pair only fits fresh"
	},
	description: "The established pagination regression contract relocates a preceding inline DrawingML resource with an immediately following host-owned anchor paragraph before an authored page break when the pair fits only in a fresh flow region."
}), K({
	id: "word-continuous-section-mark-spacing",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/body-layout-input.test.ts#projects mutually exclusive collapsed-mark and drop-previous-after roles"
	},
	description: "The retained body input projects the established continuous-section empty-mark spacing behavior into one mutually exclusive role before pagination."
}), K({
	id: "word-contextual-spacing-per-side",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/contextual-spacing-body-paint.test.ts#paints the adjudicated six-case gap table"
	},
	description: "For same-style adjacent paragraphs, contextualSpacing removes only the contribution owned by each toggling side; a current-only toggle preserves the previous paragraph spaceAfter contribution."
}), K({
	id: "word-empty-keep-next-bridge",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/body-paginator-production.test.ts#bridges an undecorated empty keepNext mark through the following paragraph"
	},
	description: "Word print pagination treats an undecorated empty keep-with-next paragraph as a bridge: the following paragraph is admitted completely with the first indivisible content of its successor."
}), K({
	id: "word-automatic-keep-next-start-spacing",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/body-paginator-production.test.ts#suppresses leading spacing when a keepNext unit moves to an automatic page"
	},
	description: "When automatic overflow relocates a keep-with-next unit to a fresh physical page, suppress the leading paragraph space-before for that grouped relocation without changing ordinary overflow or authored-break spacing."
}), K({
	id: "word-trailing-space-after-fit-admission",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/paragraph-pagination.test.ts#admits final visible content when only authored spaceAfter crosses the region edge"
	},
	description: "Admit the final visible paragraph content at a flow-region edge when only its authored trailing space crosses the edge, while retaining that space for placement and paint."
}), K({
	id: "word-vertical-rl-final-line-baseline-admission",
	evidence: {
		kind: "office-observation",
		syntheticFixtureId: "vertical-rl-final-line-baseline-admission",
		application: "Microsoft Word",
		version: "16.111.1",
		platform: "macOS 26.5.2"
	},
	description: "In a vertical-rl section, Word admits the final visible text column when its transformed baseline and retained visible ink remain inside the block-end edge even if the complete logical line box crosses that edge. The complete retained advance remains authoritative after admission."
});
function kc(e) {
	return Math.max(0, e.advancePt - Math.min(e.authoredSpaceAfterPt, e.retainedSpaceAfterPt));
}
function Ac(e) {
	return e.origin.yPt + (e.inkBounds?.descentPt ?? 0);
}
function jc(e) {
	if (e.kind === "resource" || e.kind === "drawing") return e.bounds.yPt + e.bounds.heightPt;
	if (e.kind === "anchor-host") return null;
	if (e.kind === "tab") {
		let t = e.leaderGlyphs ?? [];
		return t.length > 0 ? Math.max(...t.map(Ac)) : null;
	}
	let t = e.paintOps ?? [], n = t.length > 0 ? t.map((t) => e.origin.yPt + t.offset.yPt + (t.blockAxisInkBounds?.endPt ?? t.inkBounds?.descentPt ?? 0)) : [e.origin.yPt];
	for (let t of e.decorations) {
		let e = t.widthPt / 2;
		n.push(t.from.yPt + e, t.to.yPt + e);
		for (let r of t.path ?? []) n.push(r.yPt + e);
	}
	for (let t of e.highlightFragments ?? []) n.push(t.rect.yPt + t.rect.heightPt);
	for (let t of e.runBorderFragments ?? []) {
		let e = t.widthPt / 2;
		n.push(t.from.yPt + e, t.to.yPt + e);
	}
	for (let t of e.emphasis?.glyphs ?? []) n.push(Ac(t));
	for (let t of e.ruby?.paintOps ?? []) n.push(Ac(t));
	for (let t of e.emphasis?.paths ?? []) {
		let e = t.stroke === null ? 0 : t.strokeWidthPt / 2;
		for (let r of t.points) n.push(r.yPt + e);
	}
	return Math.max(...n);
}
function Mc(e) {
	if (e.writingMode !== "vertical-rl" || e.logicalLineBoxExtentPt <= e.availableBlockExtentPt) return e.logicalLineBoxExtentPt;
	let t = e.paragraph.lines.at(-1);
	if (!t || t.placements.some((e) => e.kind === "text" && (e.paintOps ?? []).some((e) => e.glyphOrientation !== void 0 && e.blockAxisInkBounds === void 0))) return e.logicalLineBoxExtentPt;
	let n = t.placements.flatMap((e) => {
		let t = jc(e);
		return t === null ? [] : [t];
	});
	if (n.length === 0 || e.paragraph.shading) return e.logicalLineBoxExtentPt;
	for (let t of e.paragraph.borders) {
		let e = t.widthPt / 2;
		n.push(t.from.yPt + e, t.to.yPt + e);
	}
	if (e.paragraph.paragraphMark && !e.paragraph.paragraphMark.hidden) {
		let t = e.paragraph.paragraphMark.bounds;
		n.push(t.yPt + t.heightPt);
	}
	return Math.max(0, Math.max(...n) - e.paragraph.flowBounds.yPt);
}
function Nc(e) {
	return e.keepNext && e.inkless && e.undecoratedMark;
}
function Pc(e, t) {
	let n = e[t];
	if (n?.kind !== "body-block" || n.block.kind !== "paragraph") return;
	let r = e[t + 1], i = e[t + 2], a = n.block.inkless === !0 && r?.kind === "begin-section" && r.section.startType === "continuous";
	return a && n.block.spaceBeforePt === 0 ? "collapse-mark" : a ? "suppress-before" : n.block.inkless === !0 && r?.kind === "body-block" && r.block.kind === "paragraph" && r.block.inkless === !0 && r.block.spaceBeforePt === 0 && i?.kind === "begin-section" && i.section.startType === "continuous" ? "drop-previous-after" : void 0;
}
function Fc(e) {
	return e.drawings.length > 0 && e.lines.every((e) => e.placements.every((e) => e.kind === "drawing" || e.kind === "anchor-host"));
}
function Ic(e) {
	return e.lines.some((e) => e.placements.some((e) => e.kind === "resource" && (e.resourceKind === "image" || e.resourceKind === "chart") && e.bounds !== void 0 && e.bounds.widthPt > 0 && e.bounds.heightPt > 0));
}
function Lc(e, t) {
	if (!Fc(e)) return null;
	let n = e.drawings.filter((e) => e.anchorLayer?.verticalOwnership === "host" && Number.isFinite(e.flowBounds.xPt) && Number.isFinite(e.flowBounds.yPt) && Number.isFinite(e.flowBounds.widthPt) && Number.isFinite(e.flowBounds.heightPt) && e.flowBounds.widthPt > 0 && e.flowBounds.heightPt > 0);
	if (n.length !== e.drawings.length) return null;
	let r = Math.max(...n.map((e) => e.flowBounds.yPt + e.flowBounds.heightPt));
	return Math.max(0, r - t);
}
function Rc(e) {
	if (!Fc(e)) return null;
	let { paragraphMark: t, ...n } = e;
	return Object.freeze({
		...n,
		advancePt: 0,
		flowBounds: Object.freeze({
			...e.flowBounds,
			heightPt: 0
		})
	});
}
function zc(e) {
	let t = /* @__PURE__ */ new Set(), n = !1;
	for (let r = e.length - 1; r >= 0; --r) {
		let i = e[r];
		if (i.kind === "body-block") {
			n = i.block.kind !== "paragraph" || !i.block.pageBreakBefore;
			continue;
		}
		if (i.kind === "adjacent-table-group") {
			n = !0;
			continue;
		}
		if (i.kind === "authored-break") {
			i.break === "column" ? n && t.add(r) : n = !1;
			continue;
		}
		i.kind === "begin-section" && i.section.startType !== "continuous" && (n = !1);
	}
	return t;
}
//#endregion
//#region packages/docx/src/layout/body-layout-input.ts
function Bc(e) {
	switch (e) {
		case "continuous":
		case "nextColumn":
		case "nextPage":
		case "oddPage":
		case "evenPage": return e;
		default: return "nextPage";
	}
}
function Vc(e, t, n) {
	let r = n === null ? null : `section:${n}`, i = (n) => e[n] === null ? null : {
		story: t,
		storyInstance: r === null ? n : `${r}:${n}`,
		path: []
	};
	return Object.freeze({
		default: i("default"),
		first: i("first"),
		even: i("even")
	});
}
function Hc(e) {
	return {
		...e.geometry,
		titlePage: e.titlePage,
		evenAndOddHeaders: !1,
		sectionStart: e.startType,
		columns: e.columns,
		textDirection: e.textDirection,
		docGridType: e.docGridType,
		docGridLinePitch: e.docGridLinePitch,
		docGridCharSpace: e.docGridCharSpace,
		pageNumType: e.pageNumType,
		vAlign: e.vAlign,
		lineNumbering: e.lineNumbering
	};
}
function Uc(e, t) {
	let n = e.markerBodyIndex;
	return Object.freeze({
		sectionOccurrenceId: e.sectionOccurrenceId,
		source: Object.freeze(n === null ? {
			story: "body",
			storyInstance: "body",
			path: Object.freeze([])
		} : {
			story: "body",
			storyInstance: "body",
			path: Object.freeze([n])
		}),
		startType: Bc(e.startType),
		context: Object.freeze(Tc(Hc(e), e.sectionBidi)),
		pageNumbering: Object.freeze({
			start: e.pageNumType?.start ?? null,
			format: e.pageNumType?.fmt ?? null
		}),
		titlePage: e.titlePage,
		evenAndOddHeaders: t.evenAndOddHeaders,
		headers: Vc(e.headers, "header", n),
		footers: Vc(e.footers, "footer", n),
		pageBordersAuthored: e.pageBordersAuthored,
		pageBorders: e.pageBorders,
		pageLayout: Object.freeze({
			physicalGeometry: Object.freeze({ ...e.geometry }),
			columns: e.columns,
			textDirection: e.textDirection ?? "lrTb",
			gutterPt: e.gutterPt,
			rtlGutter: e.rtlGutter,
			...t.pageLayoutSettings
		})
	});
}
function Wc(e) {
	let t = new Map(e.sectionIndex.occurrences.map((t) => [t.sectionOccurrenceId, Uc(t, e)])), n = e.sectionIndex.occurrences[0];
	if (!n) throw Error("DOCX body requires a final section owner");
	let r = t.get(n.sectionOccurrenceId), i = e.sequence.map((e) => {
		if (e.kind !== "begin-section") return e;
		let n = t.get(e.section.sectionOccurrenceId);
		if (!n) throw Error(`Missing body section owner: ${e.section.sectionOccurrenceId}`);
		return Object.freeze({
			...e,
			section: n
		});
	});
	return H({
		source: {
			story: "body",
			storyInstance: "body",
			path: []
		},
		initialSection: r,
		sequence: i.map((e, t) => {
			if (e.kind !== "body-block" || e.block.kind !== "paragraph") return e;
			let n = Pc(i, t);
			return n === void 0 ? e : Object.freeze({
				...e,
				block: Object.freeze({
					...e.block,
					continuousSectionRole: n
				})
			});
		}),
		parserDiagnostics: e.parserDiagnostics ?? [],
		endnoteIds: e.endnoteIds ?? [],
		noteLayoutSettings: e.noteLayoutSettings
	}, "DOCX body layout input");
}
//#endregion
//#region packages/docx/src/layout/paragraph-visibility.ts
function Gc(e) {
	return !(e.runs ?? []).some((e) => e.type === "text" ? e.text.length > 0 : !0);
}
K({
	id: "word-exact-row-height-bottom-padding",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §2.1.180(d)"
	},
	description: "Word adds the largest bottom cell margin to an exact trHeight instead of treating that margin as part of the authored height."
}), K({
	id: "word-nil-table-border-suppression",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §2.1.169"
	},
	description: "Word treats a table border value of none as omission while nil remains authored and suppresses the complete shared edge."
}), K({
	id: "word-spaced-cell-inside-border-conflict",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §§2.1.136, 2.1.138"
	},
	description: "With non-zero cell spacing, Word retains the narrow conditional tcBorders insideH/insideV conflict against the corresponding table inside border."
}), K({
	id: "word-table-indent-all-alignments",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §2.1.155"
	},
	description: "Word applies tblInd as a signed leading-edge translation for every table alignment, reversing the translation for bidi visual order."
}), K({
	id: "word-exact-row-vertical-clip-only",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/table.test.ts#clips an overflowing merged owner when every row in its span is exact"
	},
	description: "Preserve the established exact-row overflow behavior that clips the owned vertical interval without clipping nested table ink horizontally to the cell box."
}), K({
	id: "word-over-page-cant-split-clip",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §2.1.120"
	},
	description: "Word starts an over-page cantSplit row on a fresh page and clips its overflow instead of synthesizing a row continuation."
}), K({
	id: "word-positioned-table-adjacency-exclusion",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §2.1.149(a)"
	},
	description: "Word excludes effectively positioned tables from the logical adjacent-table sequence before retained layout consumes the parser-owned sequence identity."
}), K({
	id: "word-table-border-weight-precedence",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §2.1.169"
	},
	description: "Use the documented Word border numbers for shared-cell conflict weight and force dotted and dashed borders to a complete weight of one."
}), K({
	id: "word-omitted-row-height-rule-at-least",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §2.1.180"
	},
	description: "Treat an omitted trHeight hRule as atLeast while retaining an explicitly authored auto rule as authored input."
}), K({
	id: "word-authored-auto-row-height-floor",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/table-row-height.test.ts#auto with @val — @val is honored as a lower bound"
	},
	description: "Preserve the established legacy-model behavior that an auto row with an authored height value uses that value as a lower bound."
}), K({
	id: "word-effective-floating-table-positioning",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §2.1.162"
	},
	description: "Use parser-retained effective positioning status rather than lexical tblpPr presence to decide whether a table leaves ordinary flow."
}), K({
	id: "word-table-cell-spacing-scope-shadow",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §§2.1.152, 2.1.153, 2.1.154"
	},
	description: "At each table-cell-spacing precedence scope, pct, auto, and nil resolve to zero and shadow lower scopes instead of being treated as absent."
}), K({
	id: "word-table-margin-scope-shadow",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §§2.1.116, 2.1.125, 2.1.146, 2.1.177"
	},
	description: "Preserve the documented scope-specific treatment of non-dxa table cell margins: leading/trailing defaults may resolve to zero while cell/exception and nil top/bottom values remain ignored."
}), K({
	id: "word-first-row-table-exception-scope",
	evidence: {
		kind: "microsoft-note",
		reference: "[MS-OI29500] §§2.1.156, 2.1.158, 2.1.167"
	},
	description: "Apply the supported first-row table-property exception facts at table scope, including authored preferred-width shadowing."
}), K({
	id: "word-trailing-structural-cell-marker",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/compatibility.test.ts#drops only an empty trailing paragraph after a non-paragraph cell block"
	},
	description: "Exclude the required empty trailing cell paragraph from row-height and vertical-alignment measurements when it follows a visible non-paragraph block."
}), K({
	id: "word-cell-vertical-alignment-ink-block",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/cell-valign-leading-spacing.test.ts#inked block is vertically centred in the cell (midpoint = cell midpoint)"
	},
	description: "Center or bottom-align the visible cell ink block without charging the first paragraph spaceBefore or final paragraph spaceAfter at the cell edges."
}), K({
	id: "word-vertical-merge-terminal-border",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/cell-border-conflict-render.test.ts#uses the final continuation cell border at the bottom of a vertical merge"
	},
	description: "Resolve the bottom edge of a vertically merged cell from its terminal continuation cell before applying shared-edge conflict rules."
}), K({
	id: "word-vertical-section-upright-block-table",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/vertical-table-upright.test.ts#the table advances the flow by its PHYSICAL WIDTH; body text stays vertical"
	},
	description: "Paint a block table in an upright physical frame within a vertical section and charge its physical width as the body-flow advance."
});
function Kc(e, t) {
	return Math.max(0, e ?? 0) + Math.max(0, ...t);
}
function qc(e) {
	return e != null && e !== "none";
}
function Jc(e, t, n) {
	return n ? e - t : e + t;
}
function Yc(e) {
	return e.spacingPt > 0 && !qc(e.directStyle) && qc(e.conditionalInsideStyle);
}
function Xc(e, t) {
	return Object.freeze({
		xPt: t.xPt,
		yPt: e.yPt,
		widthPt: t.widthPt,
		heightPt: e.heightPt
	});
}
function Zc(e) {
	return e.compatibility === "word" && e.availableHeightPt + e.epsilonPt >= e.freshPageHeightPt;
}
var Qc = Object.freeze([
	"single",
	"thick",
	"double",
	"dotted",
	"dashed",
	"dotDash",
	"dotDotDash",
	"triple",
	"thinThickSmallGap",
	"thickThinSmallGap",
	"thinThickThinSmallGap",
	"thinThickMediumGap",
	"thickThinMediumGap",
	"thinThickThinMediumGap",
	"thinThickLargeGap",
	"thickThinLargeGap",
	"thinThickThinLargeGap",
	"wave",
	"doubleWave",
	"dashSmallGap",
	"dashDotStroked",
	"threeDEmboss",
	"threeDEngrave",
	"outset",
	"inset"
]), $c = Object.freeze({
	single: 1,
	thick: 2,
	double: 3,
	dotDash: 8,
	dotDotDash: 9,
	triple: 10,
	thinThickSmallGap: 11,
	thickThinSmallGap: 12,
	thinThickThinSmallGap: 13,
	thinThickMediumGap: 14,
	thickThinMediumGap: 15,
	thinThickThinMediumGap: 16,
	thinThickLargeGap: 17,
	thickThinLargeGap: 18,
	thinThickThinLargeGap: 19,
	wave: 20,
	doubleWave: 21,
	dashSmallGap: 22,
	dashDotStroked: 23,
	threeDEmboss: 24,
	threeDEngrave: 25,
	outset: 26,
	inset: 27
});
function el(e, t) {
	return e === "dotted" || e === "dashed" ? 1 : Math.max(0, t) * 8 * ($c[e] ?? 0);
}
function tl(e, t) {
	return e === "nil" || t === "nil";
}
function nl(e, t) {
	return t ? e : "atLeast";
}
function rl(e, t) {
	return e === "pct" || e === "auto" || e === "nil" ? 0 : t;
}
function il(e) {
	return e.kind === "dxa" ? e.dxaValuePt : e.scope === "cell" || e.scope === "exception" ? null : (e.edge === "start" || e.edge === "end") && (e.kind === "pct" || e.kind === "auto" || e.kind === "nil") ? 0 : null;
}
//#endregion
//#region packages/docx/src/parser-model.ts
var al = /* @__PURE__ */ new WeakMap();
function ol(e) {
	return al.get(e) ?? [];
}
function sl(e) {
	let t = ol(e);
	if (t.length === 0) return e.runs;
	let n = [], r = 0;
	for (let i = 0; i <= e.runs.length; i += 1) {
		for (; t[r]?.publicRunIndex === i;) n.push(t[r].run), r += 1;
		i < e.runs.length && n.push(e.runs[i]);
	}
	return n;
}
function cl(e) {
	return ol(e).length > 0;
}
function ll(e) {
	let t = e.__pageLayoutSettings;
	return H({
		mirrorMargins: t?.mirrorMargins === !0,
		gutterAtTop: t?.gutterAtTop === !0,
		bookFoldPrinting: t?.bookFoldPrinting === !0,
		bookFoldRevPrinting: t?.bookFoldRevPrinting === !0,
		printTwoOnOne: t?.printTwoOnOne === !0
	}, "DOCX page layout settings input");
}
function ul(e) {
	let t = e.__noteLayoutSettings;
	return H({
		footnotePosition: t?.footnotePosition ?? "pageBottom",
		endnotePosition: t?.endnotePosition ?? "docEnd"
	}, "DOCX note layout settings input");
}
function dl(e) {
	return Object.freeze(e ? Object.fromEntries(Object.entries(e).filter((e) => typeof e[1] == "number")) : {});
}
function fl(e) {
	return Object.freeze({
		...e,
		pageGeometry: dl(e.pageGeometry)
	});
}
var pl = /* @__PURE__ */ new WeakMap(), ml = /* @__PURE__ */ new WeakMap(), hl = /* @__PURE__ */ new WeakMap(), gl = /* @__PURE__ */ new WeakMap();
function _l(e) {
	let t = hl.get(e);
	if (t) return t;
	let n = H({
		table: e.__tableLayout ?? null,
		rows: e.rows.map((e) => ({
			row: e.__tableRowLayout ?? null,
			cells: e.cells.map((e) => e.__tableCellLayout ?? null)
		}))
	}, "DOCX table acquisition input");
	return hl.set(e, n), n;
}
function vl(e) {
	return Nl(e).ordinaryFlow;
}
function yl(e) {
	return Nl(e).positioning === null ? null : e.tblpPr ?? null;
}
function bl(e) {
	return {
		leftFromTextPt: e.leftFromText,
		rightFromTextPt: e.rightFromText,
		topFromTextPt: e.topFromText,
		bottomFromTextPt: e.bottomFromText,
		horzAnchor: e.horzAnchor,
		horzSpecified: e.horzSpecified,
		vertAnchor: e.vertAnchor,
		xPt: e.tblpX,
		yPt: e.tblpY,
		...e.tblpXSpec == null ? {} : { xAlign: e.tblpXSpec },
		...e.tblpYSpec == null ? {} : { yAlign: e.tblpYSpec }
	};
}
function xl(e, t) {
	if (e === null) return null;
	let n = e.trim(), r = t && n.endsWith("%") ? n.slice(0, -1) : n;
	if (r.length === 0) return null;
	let i = Number(r);
	return Number.isFinite(i) ? i : null;
}
function Sl(e) {
	return e.value?.trim().endsWith("%") ? "pct" : e.kind ?? "dxa";
}
function Cl(e) {
	if (!e) return null;
	let t = e.value?.trim() ?? "", n = Sl(e);
	if (n === "dxa") {
		let t = xl(e.value ?? "0", !1);
		return t === null ? null : {
			kind: "dxa",
			value: t / 20
		};
	}
	if (n !== "pct") return null;
	let r = xl(e.value ?? "0", !0);
	return r === null ? null : {
		kind: "pct",
		value: t.endsWith("%") ? r / 100 : r / 5e3
	};
}
function wl(e) {
	let t = Cl(e);
	return t?.kind === "dxa" ? t.value : null;
}
function Tl(e) {
	let t = xl(e ?? null, !1);
	return t === null ? null : t / 20;
}
function El(e) {
	return e === "exact" || e === "atLeast" ? e : "auto";
}
function Dl(e) {
	return {
		rule: nl(El(e.rule), e.ruleAuthored),
		valuePt: Tl(e.value)
	};
}
function Ol(e) {
	if (e.rowHeight === null || !Number.isFinite(e.rowHeight)) return null;
	let t = El(e.rowHeightRule);
	return {
		rule: t === "auto" ? "atLeast" : t,
		valuePt: e.rowHeight
	};
}
function kl(...e) {
	for (let t of e) {
		if (!t) continue;
		let e = rl(Sl(t), wl(t));
		if (e !== null) return e;
	}
	return null;
}
function Al(e, t, n) {
	if (!e) return null;
	let r = Sl(e);
	return il({
		kind: r,
		dxaValuePt: r === "dxa" ? Tl(e.value ?? "0") : null,
		scope: t,
		edge: n
	});
}
function jl(e, t, n, r, i, a, o) {
	let s = e.bidiVisual === !0, c = (e, t) => {
		let n = t === "left" ? s ? "end" : "start" : s ? "start" : "end";
		return {
			width: e?.[t] ?? e?.[n],
			edge: n
		};
	}, l = (e, ...t) => {
		for (let n of t) {
			let t = Al(n.width, n.scope, n.edge ?? e);
			if (t !== null) return t;
		}
		return null;
	}, u = c(r, "left"), d = c(i, "left"), f = c(a, "left"), p = c(o, "left"), m = c(r, "right"), h = c(i, "right"), g = c(a, "right"), _ = c(o, "right"), v = (e) => !n && e != null && Number.isFinite(e) ? e : null;
	return {
		top: l("top", {
			width: r?.top,
			scope: "cell"
		}) ?? v(t.marginTop) ?? l("top", {
			width: i?.top,
			scope: "exception"
		}, {
			width: a?.top,
			scope: "table"
		}, {
			width: o?.top,
			scope: "style"
		}) ?? e.cellMarginTop,
		bottom: l("bottom", {
			width: r?.bottom,
			scope: "cell"
		}) ?? v(t.marginBottom) ?? l("bottom", {
			width: i?.bottom,
			scope: "exception"
		}, {
			width: a?.bottom,
			scope: "table"
		}, {
			width: o?.bottom,
			scope: "style"
		}) ?? e.cellMarginBottom,
		left: l(u.edge, {
			...u,
			scope: "cell"
		}) ?? v(t.marginLeft) ?? l(d.edge, {
			...d,
			scope: "exception"
		}, {
			...f,
			scope: "table"
		}, {
			...p,
			scope: "style"
		}) ?? e.cellMarginLeft,
		right: l(m.edge, {
			...m,
			scope: "cell"
		}) ?? v(t.marginRight) ?? l(h.edge, {
			...h,
			scope: "exception"
		}, {
			...g,
			scope: "table"
		}, {
			..._,
			scope: "style"
		}) ?? e.cellMarginRight
	};
}
function Ml(e) {
	if (!e) return null;
	let t = e.indent ? Sl(e.indent) : null;
	return {
		preferredWidthAuthored: e.preferredWidth != null,
		preferredWidth: Cl(e.preferredWidth),
		layout: e.layout?.kind === "fixed" || e.layout?.kind === "autofit" ? e.layout.kind : null,
		justification: e.justification,
		indentAuthored: e.indent != null && (t === "dxa" || t === "nil"),
		indentPt: t === "nil" ? 0 : wl(e.indent),
		borders: e.borders
	};
}
function Nl(e) {
	let t = gl.get(e);
	if (t) return t;
	let n = _l(e), r = n.table?.ordinaryFlow ?? e.tblpPr == null, i = e.rows.map((t, r) => {
		let i = n.rows[r]?.row ?? null, a = i?.exception ?? null;
		return {
			height: i?.height ? Dl(i.height) : Ol(t),
			cantSplit: t.cantSplit === !0,
			repeatedHeader: t.isHeader === !0,
			cellSpacingPt: kl(i?.cellSpacing, a?.cellSpacing, n.table?.cellSpacing, i?.styleCellSpacing) ?? 0,
			justification: i?.justification ?? a?.justification ?? null,
			exception: Ml(a),
			cells: t.cells.map((t, o) => ({ marginsPt: jl(e, t, n.rows[r]?.cells[o] !== null && n.rows[r]?.cells[o] !== void 0, n.rows[r]?.cells[o]?.margins, a?.cellMargins, n.table?.cellMargins, i?.styleCellMargins) }))
		};
	}), a = H({
		effectiveStyleId: n.table?.effectiveStyleId ?? null,
		ordinaryFlow: r,
		logicalSequenceId: n.table?.logicalSequenceId ?? null,
		logicalRowOffset: n.table?.logicalRowOffset ?? 0,
		logicalTotalRows: n.table?.logicalTotalRows ?? 0,
		positioning: r || e.tblpPr == null ? null : bl(e.tblpPr),
		rows: i,
		firstRowException: i[0]?.exception ?? null
	}, "DOCX table format input");
	return gl.set(e, a), a;
}
function Pl(e) {
	return Object.freeze(e.map((e) => {
		if (e.type !== "table") return Object.freeze({
			element: e,
			table: null
		});
		let t = Nl(e);
		return t.logicalSequenceId == null ? Object.freeze({
			element: e,
			table: null
		}) : Object.freeze({
			element: e,
			table: Object.freeze({
				logicalSequenceId: t.logicalSequenceId,
				logicalRowOffset: t.logicalRowOffset ?? 0,
				logicalTotalRows: t.logicalTotalRows ?? 0,
				rowCount: e.rows.length
			})
		});
	}));
}
var Fl = (e) => Object.freeze({
	story: "body",
	storyInstance: "body",
	path: Object.freeze([e])
}), Il = new Set([
	"paragraph",
	"line",
	"character"
]);
function Ll(e, t, n) {
	if (e.type !== "shape" && e.type !== "image" && e.type !== "chart" || ou(e) !== void 0 || !Zi(e.wrapMode) || e.type !== "shape" && !e.anchor || e.widthPt <= 0 || e.heightPt <= 0) return null;
	let r = e.anchorXRelativeFrom ?? (e.anchorXFromMargin ? "margin" : "page"), i = e.anchorYRelativeFrom ?? (e.anchorYFromPara ? "paragraph" : "page"), a = `${t.story}:${t.storyInstance}:${t.path.join(".")}`;
	return Object.freeze({
		occurrenceId: e.type === "shape" ? `public-shape:${a}:${n}` : `public-anchor:${a}:${n}`,
		pageOwned: !Il.has(r) && !Il.has(i)
	});
}
function Rl(e, t) {
	let n = new Set([
		"paragraph",
		"line",
		"character"
	]), r = Object.freeze([...new Set(sl(e).flatMap((e, r) => {
		let i = e;
		if (e.type !== "shape" && e.type !== "image" && e.type !== "chart" && i.type !== "unavailableDrawing") return [];
		let a = ou(i);
		if (!a) {
			let e = i.type === "unavailableDrawing" ? null : Ll(i, t, r);
			return e?.pageOwned ? [e.occurrenceId] : [];
		}
		return a.horizontal.relativeFromStatus !== "valid" || a.vertical.relativeFromStatus !== "valid" || a.horizontal.relativeFrom === null || a.vertical.relativeFrom === null || a.wrap.kind === "none" || n.has(a.horizontal.relativeFrom) || n.has(a.vertical.relativeFrom) ? [] : [Nn(t, a.occurrenceId)];
	}))]);
	return Object.freeze({
		kind: "paragraph",
		source: t,
		pageBreakBefore: e.pageBreakBefore === !0,
		keepLines: e.keepLines === !0,
		keepNext: e.keepNext === !0,
		widowControl: e.widowControl !== !1,
		spaceBeforePt: e.spaceBefore ?? 0,
		spaceAfterPt: e.spaceAfter ?? 0,
		contextualSpacing: e.contextualSpacing === !0,
		styleId: e.styleId ?? null,
		inkless: !cl(e) && Gc(e),
		...r.length === 0 ? {} : { pageOwnedAnchorOccurrenceIds: r }
	});
}
function zl(e) {
	return Object.freeze({
		kind: "table",
		source: e
	});
}
function Bl(e, t) {
	let n = 0;
	return Object.freeze(Oc(Pl(e)).map((e) => {
		if (e.kind === "adjacent-table-group") {
			let t = n;
			return n += e.tables.length, Object.freeze({
				kind: "adjacent-table-group",
				logicalSequenceId: e.logicalSequenceId,
				source: Fl(t),
				tables: Object.freeze(e.tables.map((e, n) => Object.freeze({
					...zl(Fl(t + n)),
					rowCount: e.rows.length
				})))
			});
		}
		let r = e.element, i = n, a = Fl(i);
		if (n += 1, r.type === "paragraph") return r.markVanish === !0 && !cl(r) && Gc(r) ? Object.freeze({
			kind: "consume-source",
			source: a,
			reason: "hidden-paragraph"
		}) : Object.freeze({
			kind: "body-block",
			block: Rl(r, a)
		});
		if (r.type === "table") return Object.freeze({
			kind: "body-block",
			block: zl(a)
		});
		if (r.type === "pageBreak" || r.type === "columnBreak") return Object.freeze({
			kind: "authored-break",
			source: a,
			break: r.type === "pageBreak" ? "page" : "column",
			...r.type === "pageBreak" && r.parity !== void 0 ? { parity: r.parity } : {},
			...r.type === "pageBreak" && r.sameParagraphAsPrevious === !0 ? { sameSourceParagraphAsPrevious: !0 } : {}
		});
		if (r.type === "sectionBreak") return Object.freeze({
			kind: "begin-section",
			source: a,
			section: t(i)
		});
		throw Error(`Unsupported body layout source at ${i}`);
	}));
}
function Vl(e) {
	return e.widthPt == null ? e.widthPct == null ? null : {
		kind: "pct",
		value: e.widthPct / 5e3
	} : {
		kind: "dxa",
		value: e.widthPt
	};
}
function Hl(e, t, n, r) {
	let i = r?.preferredWidth ?? null;
	if (r?.preferredWidthAuthored) return i?.kind === "dxa" ? i.value > 0 ? i.value : null : i?.kind === "pct" && i.value > 0 ? i.value * n : null;
	let a = Cl(t.table?.preferredWidth);
	return a?.kind === "dxa" ? a.value > 0 ? a.value : null : a?.kind === "pct" ? a.value > 0 ? a.value * n : null : e.widthPt != null && e.widthPt > 0 ? e.widthPt : e.widthPct != null && e.widthPct > 0 ? e.widthPct / 5e3 * n : null;
}
var Ul = Object.freeze({
	pt: "1/1",
	in: "72/1",
	cm: "3600/127",
	mm: "360/127",
	pc: "12/1",
	pi: "12/1"
}), Wl = "18446744073709551615";
function Gl(e) {
	let t = e.replace(/[\u0009\u000a\u000d\u0020]+/g, " ").replace(/^ | $/g, ""), n = /^([+-]?)([0-9]+)$/.exec(t);
	if (!n) return null;
	let [, r, i] = n;
	if (r === "-" && /[1-9]/.test(i)) return null;
	let a = i.replace(/^0+/, "") || "0";
	return a.length > 20 || a.length === 20 && a > Wl ? null : t;
}
function Kl(e) {
	let t = Zn(e);
	return Number.isFinite(t) ? {
		key: e,
		widthPt: t
	} : Jl;
}
function ql(e, t) {
	let n = Number(e);
	if (!Number.isFinite(n)) return Jl;
	let r = Jn(n), i = r === null ? 0 : Zn($n(r, t));
	return Number.isFinite(i) ? {
		key: null,
		widthPt: i
	} : Jl;
}
var Jl = {
	key: "0/1",
	widthPt: 0
};
function Yl(e) {
	if (e == null) return Jl;
	let t = Gl(e);
	if (t !== null) {
		let e = qn(t);
		return e === null ? Jl : Kl(tr(e, 20n));
	}
	let n = /^([0-9]+(?:\.[0-9]+)?)(mm|cm|in|pt|pc|pi)$/.exec(e);
	if (!n) return Jl;
	let r = Ul[n[2]], i = qn(n[1]);
	return i === null ? ql(n[1], r) : Kl($n(i, r));
}
function Xl(e, t) {
	let n = t.table?.grid;
	if (!n) {
		let t = e.colWidths.map((e) => Number.isFinite(e) && e >= 0 ? {
			widthPt: e,
			key: Jn(e) ?? "0/1"
		} : Jl);
		return {
			widthsPt: t.map((e) => e.widthPt),
			widthKeys: t.map((e) => e.key)
		};
	}
	let r = Math.max(n.requiredColumnCount, n.columns.length), i = Array.from({ length: r }, (e, t) => Yl(n.columns[t]?.width ?? null));
	return {
		widthsPt: i.map((e) => e.widthPt),
		widthKeys: i.map((e) => e.key)
	};
}
function Zl(e, t) {
	let n = Cl(e);
	return n?.kind === "pct" ? {
		kind: "dxa",
		value: Math.max(0, n.value) * Math.max(0, t)
	} : n;
}
function Ql(e, t, n, r = t) {
	let i = _l(e), a = Nl(e), { widthsPt: o, widthKeys: s } = Xl(e, i), c = a.firstRowException?.layout === "fixed" ? "fixed" : i.table?.layout?.kind ?? e.layout, l = i.table?.grid.authored ? i.table.grid.columns.length : null, u = e.rows.map((e) => {
		let t = Math.max(0, e.gridBefore ?? 0);
		return l !== null && t > l ? 0 : t;
	}), d = Math.max(l ?? 0, i.table?.grid.requiredColumnCount ?? 0, ...e.rows.map((e, t) => (u[t] ?? 0) + e.cells.reduce((e, t) => e + Math.max(1, t.colSpan), 0)));
	return {
		layout: c === "fixed" ? "fixed" : "autofit",
		availableWidthPt: Math.max(0, r),
		gridWidthsPt: o,
		gridWidthKeys: s,
		tablePreferredWidthPt: Hl(e, i, t, a.firstRowException),
		rows: e.rows.map((e, r) => {
			let s = i.rows[r], f = u[r] ?? 0, p = Math.max(0, e.gridAfter ?? 0), m = f + e.cells.reduce((e, t) => e + Math.max(1, t.colSpan), 0), h = l !== null && m + p > d ? 0 : p, g = f;
			return {
				before: f > 0 ? {
					columnSpan: f,
					preferredWidth: Zl(s?.row?.beforeWidth, t)
				} : null,
				after: h > 0 ? {
					columnSpan: h,
					preferredWidth: Zl(s?.row?.afterWidth, t)
				} : null,
				cells: e.cells.map((e, t) => {
					let i = s?.cells[t] ?? null, l = Math.max(1, e.colSpan), u = c === "fixed" ? {
						minWidthPt: 0,
						maxWidthPt: 0
					} : n(e), d = rr(a.rows[r]?.cellSpacingPt ?? 0, g, l, o.length), f = d.startPt + d.endPt, p = {
						columnStart: g,
						columnSpan: l,
						preferredWidth: Cl(i?.preferredWidth) ?? Vl(e),
						minContentWidthPt: Math.max(0, u.minWidthPt) + f,
						maxContentWidthPt: Math.max(u.minWidthPt, u.maxWidthPt) + f
					};
					return g += l, p;
				})
			};
		})
	};
}
function $l(e, t, n) {
	if (!t || typeof t != "object") return;
	let r = ml.get(e);
	r || (r = /* @__PURE__ */ new WeakMap(), ml.set(e, r)), r.set(t, n);
}
function eu(e) {
	let t = /* @__PURE__ */ new Map(), n = 0;
	e.body.forEach((e, r) => {
		if (e.type !== "sectionBreak") return;
		let i = e.__sectionPlacement;
		t.set(r, H({
			sectionId: i?.sectionId ?? `section:${n}`,
			sectionBidi: i?.sectionBidi === !0,
			vAlign: i?.vAlign ?? null,
			lineNumbering: i?.lineNumbering ?? null,
			docGridType: i?.docGridType ?? null,
			docGridLinePitch: i?.docGridLinePitch ?? null,
			docGridCharSpace: i?.docGridCharSpace ?? null,
			gutterPt: i?.gutterPt ?? null,
			rtlGutter: i?.rtlGutter ?? null,
			pageBordersAuthored: i?.pageBordersAuthored ?? !1,
			pageBorders: i?.pageBorders ?? null,
			pageGeometry: i?.pageGeometry ?? e.geom ?? {}
		}, "DOCX ending-section placement input")), n += 1;
	});
	let r = e.section?.__sectionPlacement;
	return Object.freeze({
		endingSections: t,
		finalSection: H({
			sectionId: r?.sectionId ?? `section:${n}`,
			sectionBidi: r?.sectionBidi === !0,
			vAlign: r?.vAlign ?? e.section?.vAlign ?? null,
			lineNumbering: r?.lineNumbering ?? e.section?.lineNumbering ?? null,
			docGridType: r?.docGridType ?? e.section?.docGridType ?? null,
			docGridLinePitch: r?.docGridLinePitch ?? e.section?.docGridLinePitch ?? null,
			docGridCharSpace: r?.docGridCharSpace ?? e.section?.docGridCharSpace ?? null,
			gutterPt: r?.gutterPt ?? null,
			rtlGutter: r?.rtlGutter ?? null,
			pageBordersAuthored: r?.pageBordersAuthored ?? e.section?.pageBorders != null,
			pageBorders: r?.pageBorders ?? e.section?.pageBorders ?? null,
			pageGeometry: r?.pageGeometry ?? (e.section ? wc(e.section) : {})
		}, "DOCX final-section placement input")
	});
}
var tu = Object.freeze({
	default: null,
	first: null,
	even: null
});
function nu(e) {
	let t = [], n = eu(e), r = 0;
	e.body.forEach((e, i) => {
		if (e.type !== "sectionBreak") return;
		let a = n.endingSections.get(i) ?? n.finalSection, o = t.length;
		t.push({
			sectionOccurrenceId: a.sectionId,
			ordinal: o,
			startBodyIndex: r,
			endBodyIndex: i,
			markerBodyIndex: i,
			final: !1,
			startType: e.kind ?? "nextPage",
			columns: e.columns ?? null,
			authoredGeometry: dl(a.pageGeometry),
			textDirection: e.textDirection ?? null,
			pageNumType: e.pageNumType ?? null,
			headers: e.headers ?? tu,
			footers: e.footers ?? tu,
			titlePage: e.titlePage ?? !1,
			sectionBidi: a.sectionBidi,
			vAlign: a.vAlign,
			lineNumbering: a.lineNumbering,
			docGridType: a.docGridType,
			docGridLinePitch: a.docGridLinePitch,
			docGridCharSpace: a.docGridCharSpace,
			authoredGutterPt: a.gutterPt,
			rtlGutter: a.rtlGutter === !0,
			pageBordersAuthored: a.pageBordersAuthored,
			pageBorders: a.pageBorders,
			placement: fl(a)
		}), r = i + 1;
	});
	let i = n.finalSection;
	t.push({
		sectionOccurrenceId: i.sectionId,
		ordinal: t.length,
		startBodyIndex: r,
		endBodyIndex: e.body.length - 1,
		markerBodyIndex: null,
		final: !0,
		startType: e.section.sectionStart ?? "nextPage",
		columns: e.section.columns ?? null,
		authoredGeometry: i.pageGeometry == null ? wc(e.section) : dl(i.pageGeometry),
		textDirection: e.section.textDirection ?? null,
		pageNumType: e.section.pageNumType ?? null,
		headers: e.headers ?? tu,
		footers: e.footers ?? tu,
		titlePage: e.section.titlePage,
		sectionBidi: i.sectionBidi,
		vAlign: i.vAlign,
		lineNumbering: i.lineNumbering,
		docGridType: i.docGridType,
		docGridLinePitch: i.docGridLinePitch,
		docGridCharSpace: i.docGridCharSpace,
		authoredGutterPt: i.gutterPt,
		rtlGutter: i.rtlGutter === !0,
		pageBordersAuthored: i.pageBordersAuthored,
		pageBorders: i.pageBorders,
		placement: fl(i)
	});
	let a = Array(t.length), o = wc(e.section), s = null, c = null;
	for (let e = t.length - 1; e >= 0; --e) {
		let n = t[e], r = n.startType === "continuous" && s !== null ? s : o, i = n.authoredGeometry, l = {
			pageWidth: i.pageWidth ?? r.pageWidth,
			pageHeight: i.pageHeight ?? r.pageHeight,
			marginTop: i.marginTop ?? r.marginTop,
			marginRight: i.marginRight ?? r.marginRight,
			marginBottom: i.marginBottom ?? r.marginBottom,
			marginLeft: i.marginLeft ?? r.marginLeft,
			headerDistance: i.headerDistance ?? r.headerDistance,
			footerDistance: i.footerDistance ?? r.footerDistance
		}, u = n.authoredGutterPt ?? (n.startType === "continuous" ? c : null) ?? 0, { authoredGeometry: d, authoredGutterPt: f, ...p } = n;
		a[e] = {
			...p,
			geometry: l,
			gutterPt: u
		}, s = l, c = u;
	}
	return H({
		bodyLength: e.body.length,
		occurrences: a
	}, "DOCX body section index input");
}
function ru(e) {
	let t = nu(e), n = /* @__PURE__ */ new Map();
	for (let e of t.occurrences) e.startBodyIndex !== 0 && n.set(e.startBodyIndex - 1, e);
	let r = Bl(e.body, (e) => {
		let t = n.get(e);
		if (!t) throw Error(`Missing incoming body section at ${e}`);
		return Object.freeze({
			sectionOccurrenceId: t.sectionOccurrenceId,
			startType: t.startType
		});
	});
	return H({
		sectionIndex: t,
		evenAndOddHeaders: e.section.evenAndOddHeaders,
		endnoteIds: (e.endnotes ?? []).map((e) => e.id),
		noteLayoutSettings: ul(e),
		pageLayoutSettings: ll(e),
		parserDiagnostics: Aa(e.diagnostics, e.body.length),
		sequence: r
	}, "DOCX body layout acquisition input");
}
function iu(e) {
	let t = e.textPath;
	if (t) return H({
		string: t.string,
		...t.fontFamily === void 0 ? {} : { fontFamily: t.fontFamily },
		bold: t.bold ?? !1,
		italic: t.italic ?? !1,
		...t.textPathOk === void 0 ? {} : { textPathOk: t.textPathOk },
		...t.on === void 0 ? {} : { on: t.on },
		...t.fitShape === void 0 ? {} : { fitShape: t.fitShape },
		...t.fitPath === void 0 ? {} : { fitPath: t.fitPath },
		...t.trim === void 0 ? {} : { trim: t.trim },
		...t.xScale === void 0 ? {} : { xScale: t.xScale },
		...t.fontSizePt === void 0 ? {} : { fontSizePt: t.fontSizePt }
	}, "DOCX VML text path acquisition input");
}
function au(e) {
	let t = e.textBoxContent;
	if (t !== void 0) return H(t, "DOCX text box content acquisition input");
}
function ou(e) {
	let t = e.__anchorAcquisition;
	if (t !== void 0) return H(t, "DOCX anchor acquisition input");
}
function su(e, t) {
	let n = fu(e).fontFacts, r = n?.rtl === !0 || n?.cs === !0, i = r ? n?.fontSizeCs ?? n?.fontSize ?? t : n?.fontSize ?? t, a = n?.fontFamily ?? e.fontFamily ?? null, o = {
		ascii: a,
		highAnsi: n?.fontFamilyHighAnsi ?? a,
		eastAsia: n?.fontFamilyEastAsia ?? e.fontFamilyEastAsia ?? a,
		complexScript: n?.fontFamilyCs ?? a
	}, s = n?.fontSlots;
	return Object.freeze({
		fontSizePt: i,
		fonts: Object.freeze({ ...s?.direct ?? o }),
		themeFonts: s?.theme ? Object.freeze({ ...s.theme }) : void 0,
		themeFontPresence: s?.themePresent ? Object.freeze({ ...s.themePresent }) : void 0,
		weight: (r ? n?.boldCs ?? !1 : n?.bold ?? !1) ? 700 : 400,
		style: (r ? n?.italicCs ?? !1 : n?.italic ?? !1) ? "italic" : "normal",
		complexScript: r,
		fontHint: n?.fontHint,
		eastAsiaLanguage: n?.langEastAsia,
		kerning: n?.kerning == null ? void 0 : i >= n.kerning
	});
}
function cu(e, t) {
	let n = au(e);
	return n === void 0 ? H({
		kind: "compatibility",
		source: t,
		paragraphs: zn(e, t, su)
	}, "DOCX public text box acquisition input") : H({
		kind: "complete",
		source: t,
		blocks: n
	}, "DOCX complete text box acquisition input");
}
function lu(e) {
	let t = pu(e).paragraphMarkFontFacts;
	if (!t) return;
	let n = t.rtl === !0 || t.cs === !0, r = e.runs.find((e) => e.type === "text" || e.type === "field")?.fontSize ?? e.defaultFontSize ?? 10, i = n ? t.fontSizeCs ?? t.fontSize ?? r : t.fontSize ?? r, a = t.fontFamily ?? e.defaultFontFamily ?? null, o = {
		ascii: a,
		highAnsi: t.fontFamilyHighAnsi ?? a,
		eastAsia: t.fontFamilyEastAsia ?? e.defaultFontFamilyEastAsia ?? a,
		complexScript: t.fontFamilyCs ?? a
	};
	return Object.freeze({
		fontSizePt: i,
		fonts: Object.freeze({ ...t.fontSlots?.direct ?? o }),
		themeFonts: t.fontSlots?.theme ? Object.freeze({ ...t.fontSlots.theme }) : void 0,
		themeFontPresence: t.fontSlots?.themePresent ? Object.freeze({ ...t.fontSlots.themePresent }) : void 0,
		weight: (n ? t.boldCs ?? !1 : t.bold ?? !1) ? 700 : 400,
		style: (n ? t.italicCs ?? !1 : t.italic ?? !1) ? "italic" : "normal",
		complexScript: n,
		fontHint: t.fontHint,
		eastAsiaLanguage: t.langEastAsia,
		kerning: t.kerning == null ? void 0 : i >= t.kerning
	});
}
function uu(e, t) {
	let { layoutLines: n, lineSlice: r, __paragraphTypographyAcquisition: i, __complexFieldBoundaries: a, ...o } = e, s = Ln(e), c = e.__complexFieldBoundaries?.map((e) => ({
		occurrenceKey: [
			"complex-field",
			t.story,
			t.storyInstance,
			t.path.slice(0, -1).join("."),
			String(e.occurrenceId)
		].join(":"),
		boundary: e.boundary,
		runIndex: e.runIndex,
		fieldType: e.fieldType,
		instruction: e.instruction,
		...e.hyperlinkAnchor === void 0 ? {} : { hyperlinkAnchor: e.hyperlinkAnchor }
	})), l = structuredClone(o), u = ol(e), d = [];
	if (u.length === 0) l.runs.forEach((t, n) => {
		d.push({
			run: t,
			originalRun: e.runs[n]
		});
	});
	else {
		let t = 0;
		for (let n = 0; n <= l.runs.length; n += 1) {
			for (; u[t]?.publicRunIndex === n;) {
				let e = u[t].run;
				d.push({
					run: structuredClone(e),
					originalRun: e
				}), t += 1;
			}
			n < l.runs.length && d.push({
				run: l.runs[n],
				originalRun: e.runs[n]
			});
		}
	}
	let f = d.map(({ run: e, originalRun: n }, r) => {
		let i = e;
		if (i.type === "unavailableDrawing") {
			let e = ou(n), r = e === void 0 ? void 0 : H({
				...e,
				occurrenceId: Nn(t, e.occurrenceId)
			}, "DOCX scoped unavailable drawing anchor acquisition input"), { __anchorAcquisition: a, ...o } = i;
			return Object.freeze({
				...o,
				...r === void 0 ? {} : { anchorAcquisitionInput: r }
			});
		}
		if (e.type === "math") {
			let n = Object.freeze({
				...t,
				path: Object.freeze([...t.path, r])
			}), i = e;
			return Object.freeze({
				...e,
				source: i.source ?? n,
				resourceKey: i.resourceKey ?? Mn(n, e.display ? "display" : "inline")
			});
		}
		if (e.type === "anchorHost") {
			let { __anchorOccurrenceId: n, ...r } = e;
			return Object.freeze({
				...r,
				...n === void 0 ? {} : { anchorOccurrenceId: Nn(t, n) }
			});
		}
		if (e.type === "shape" || e.type === "image" || e.type === "chart") {
			let i = ou(n), a = i === void 0 ? void 0 : H({
				...i,
				occurrenceId: Nn(t, i.occurrenceId)
			}, "DOCX scoped anchor acquisition input"), { __anchorAcquisition: o, ...s } = e;
			if (e.type !== "shape") return Object.freeze({
				...s,
				...a === void 0 ? {} : { anchorAcquisitionInput: a }
			});
			let c = n, l = iu(c), u = Object.freeze({
				...t,
				path: Object.freeze([...t.path, r])
			}), d = cu(c, {
				story: "textbox",
				storyInstance: `${u.story}:${u.storyInstance}:${u.path.join(".")}`,
				path: []
			});
			return Object.freeze({
				...s,
				...l === void 0 ? {} : { vmlTextPathInput: l },
				...(d.kind === "complete" ? d.blocks.length : d.paragraphs.length) === 0 ? {} : { textBoxInput: d },
				...a === void 0 ? {} : { anchorAcquisitionInput: a }
			});
		}
		if (e.type === "text" || e.type === "field") {
			let t = In(n), { __typographyAcquisition: r, ...i } = e;
			return Object.freeze({
				...i,
				...t === void 0 ? {} : { typographyInput: t }
			});
		}
		return Object.freeze({ ...e });
	});
	return Fn({
		...l,
		runs: f,
		...c?.length ? { complexFieldBoundaries: c } : {},
		numberingMarkerShapeInput: e.numbering ? su(e.numbering, e.runs.find((e) => e.type === "text" || e.type === "field")?.fontSize ?? e.defaultFontSize ?? 10) : void 0,
		paragraphMarkShapeInput: lu(e),
		...s === void 0 ? {} : { typographyInput: s }
	});
}
function du(e) {
	let t = [], n = (e, i, a, o) => {
		if (e.type === "paragraph") {
			let r = !1, s = [], c = [], l = e.runs.some((e) => e.type === "unavailableDrawing");
			sl(e).forEach((e, u) => {
				if (e.type === "unavailableDrawing") {
					c.push(Object.freeze({
						publicRunIndex: s.length,
						run: H(e, "DOCX unavailable drawing parser sidecar")
					})), l && (r = !0);
					return;
				}
				if (e.type === "math") {
					r = !0;
					let n = Object.freeze({
						story: i,
						storyInstance: a,
						path: Object.freeze([...o, u])
					}), c = Mn(n, e.display ? "display" : "inline");
					t.push(Object.freeze({
						nodes: e.nodes,
						display: e.display,
						source: n,
						resourceKey: c
					})), s.push(Object.freeze({
						...e,
						source: n,
						resourceKey: c
					}));
					return;
				}
				if (e.type !== "shape") {
					s.push(e);
					return;
				}
				let d = e.textBoxContent;
				if (d === void 0) {
					s.push(e);
					return;
				}
				let f = {
					story: i,
					storyInstance: a,
					path: [...o, u]
				}, p = `${f.story}:${f.storyInstance}:${f.path.join(".")}`, m = !1, h = d.map((e, t) => {
					if (e.type === "unsupportedTextBoxBlock") return e;
					let r = n(e, "textbox", p, [t]);
					return r !== e && (m = !0), r;
				});
				if (!m) {
					s.push(e);
					return;
				}
				r = !0, s.push({
					...e,
					textBoxContent: h
				});
			});
			let u = r ? {
				...e,
				runs: s
			} : e;
			return c.length > 0 && al.set(u, Object.freeze(c)), u;
		}
		if (e.type === "table") {
			let t = !1, n = e.rows.map((e, n) => {
				let s = !1, c = e.cells.map((e, t) => {
					let c = r(e.content, i, a, [
						...o,
						n,
						t
					]);
					return c === e.content ? e : (s = !0, {
						...e,
						content: c
					});
				});
				return s ? (t = !0, {
					...e,
					cells: c
				}) : e;
			});
			return t ? {
				...e,
				rows: n
			} : e;
		}
		if (e.type !== "sectionBreak") return e;
		let s = o.at(-1) ?? 0, c = !1, l = (e, t) => {
			if (!e) return e;
			let n = e;
			for (let i of [
				"default",
				"first",
				"even"
			]) {
				let a = e[i];
				if (!a) continue;
				let o = r(a.body, t, `section:${s}:${i}`);
				o !== a.body && (n === e && (n = { ...e }), n[i] = {
					...a,
					body: o
				}, c = !0);
			}
			return n;
		}, u = l(e.headers, "header"), d = l(e.footers, "footer");
		return c ? {
			...e,
			headers: u,
			footers: d
		} : e;
	}, r = (e, t, r, i = []) => {
		let a = !1, o = e.map((e, o) => {
			let s = n(e, t, r, [...i, o]);
			return s !== e && (a = !0), s;
		});
		return a ? o : e;
	}, i = (e, t) => {
		let n = e;
		for (let i of [
			"default",
			"first",
			"even"
		]) {
			let a = e[i];
			if (!a) continue;
			let o = r(a.body, t, i);
			o !== a.body && (n === e && (n = { ...e }), n[i] = {
				...a,
				body: o
			});
		}
		return n;
	}, a = r(e.body, "body", "body"), o = i(e.headers, "header"), s = i(e.footers, "footer"), c = (e, t) => {
		if (!e) return e;
		let n = !1, i = e.map((e) => {
			let i = r(e.content, t, e.id);
			return i === e.content ? e : (n = !0, {
				...e,
				content: i
			});
		});
		return n ? i : e;
	}, l = c(e.footnotes, "footnote"), u = c(e.endnotes, "endnote"), d = a !== e.body || o !== e.headers || s !== e.footers || l !== e.footnotes || u !== e.endnotes ? {
		...e,
		body: a,
		headers: o,
		footers: s,
		footnotes: l,
		endnotes: u
	} : e, f = eu(d);
	pl.set(d, f), $l(d.body, d.section, f);
	let p, m = () => p ??= ru(d), h = gu();
	return Object.freeze({
		document: d,
		mathOccurrences: Object.freeze(t),
		fontFamilyCharsets: Object.freeze({ ...mu(d).fontFamilyCharsets ?? {} }),
		get bodyLayoutInput() {
			return Wc(m());
		},
		bodyModelGateway: Object.freeze({
			acquisitionInputs: h,
			get bodySectionIndex() {
				return m().sectionIndex;
			},
			effectiveTablePositioning: yl,
			publicAnchorBridge: Ll
		})
	});
}
function fu(e) {
	return e;
}
function pu(e) {
	return e;
}
function mu(e) {
	return e;
}
var hu = Object.freeze({
	numberingMarkerShapeInput: su,
	paragraphMarkShapeInput: lu,
	tableFormatInput: Nl,
	tableColumnLayoutInput: Ql,
	tableParticipatesInOrdinaryFlow: vl,
	paragraphAcquisitionInput: uu
});
function gu() {
	let e = /* @__PURE__ */ new WeakMap(), t = (t, n) => {
		let r = e.get(t);
		r || (r = /* @__PURE__ */ new Map(), e.set(t, r));
		let i = kn(n), a = r.get(i);
		if (a) return a;
		let o = uu(t, n);
		return r.set(i, o), o;
	};
	return Object.freeze({
		...hu,
		paragraphAcquisitionInput: t
	});
}
//#endregion
//#region packages/docx/src/layout/resources.ts
function _u(e) {
	return du(e);
}
function vu(e, t = "body", n = "body") {
	let r = [], i = (e, a = []) => {
		e.forEach((e, o) => {
			let s = [...a, o];
			e.type === "paragraph" ? e.runs.forEach((e, i) => {
				e.type === "math" && r.push({
					nodes: e.nodes,
					display: e.display,
					source: {
						story: t,
						storyInstance: n,
						path: [...s, i]
					},
					resourceKey: Mn({
						story: t,
						storyInstance: n,
						path: [...s, i]
					}, e.display ? "display" : "inline")
				});
			}) : e.type === "table" && e.rows.forEach((e, t) => e.cells.forEach((e, n) => {
				i(e.content, [
					...s,
					t,
					n
				]);
			}));
		});
	};
	return i(e), r;
}
function yu(e) {
	return [...du(e).mathOccurrences];
}
function bu(e, t) {
	if (!Number.isFinite(e) || e < 0) throw RangeError(`${t} must be finite and non-negative`);
	return e;
}
function xu(e) {
	let t = [...e].map((e) => Object.freeze({
		resourceKey: e.resourceKey,
		widthPt: bu(e.widthPt, "widthPt"),
		heightPt: bu(e.heightPt, "heightPt"),
		mimeType: e.mimeType
	})).sort((e, t) => e.resourceKey.localeCompare(t.resourceKey)), n = new Map(t.map(({ resourceKey: e, ...t }) => [e, Object.freeze(t)]));
	if (n.size !== t.length) throw Error("Duplicate image resource key");
	return Object.freeze({
		fingerprint: On("images", t),
		resolve(e) {
			let t = n.get(e);
			if (!t) throw Error(`Unknown image resource: ${e}`);
			return t;
		}
	});
}
function Su(e) {
	let t = [...e].map((e) => Object.freeze({
		resourceKey: e.resourceKey,
		widthEm: bu(e.widthEm, "widthEm"),
		ascentEm: bu(e.ascentEm, "ascentEm"),
		descentEm: bu(e.descentEm, "descentEm"),
		diagnostics: Object.freeze(e.diagnostics.map((e) => Object.freeze({ ...e }))),
		...e.available === !1 ? { available: !1 } : {}
	})).sort((e, t) => e.resourceKey.localeCompare(t.resourceKey)), n = new Map(t.map((e) => [e.resourceKey, e]));
	if (n.size !== t.length) throw Error("Duplicate math resource key");
	return Object.freeze({
		fingerprint: On("math", t),
		resolve(e) {
			let t = n.get(e);
			if (!t) throw Error(`Unknown math resource: ${e}`);
			return t;
		}
	});
}
function Cu(e, t, n) {
	let r = [], i = (e, t, n, i, a) => {
		r.push({
			resourceKey: jn(e, t),
			widthPt: i,
			heightPt: a,
			mimeType: n
		});
	}, a = (e, t) => {
		if (e.type === "image") {
			i(t, e.imagePath, e.mimeType, e.widthPt, e.heightPt);
			return;
		}
		e.type === "shape" && e.textBlocks?.forEach((e, n) => {
			!e.imagePath || !e.mimeType || e.imageWidthPt == null || e.imageHeightPt == null || i({
				story: "textbox",
				storyInstance: `${t.story}:${t.storyInstance}:${t.path.join(".")}`,
				path: [n, 0]
			}, e.imagePath, e.mimeType, e.imageWidthPt, e.imageHeightPt);
		});
	}, o = (e, t, n, r) => {
		e.rows.forEach((e, i) => e.cells.forEach((e, a) => {
			s(e.content, t, n, [
				...r,
				i,
				a
			]);
		}));
	}, s = (e, r, c, l = []) => {
		e.forEach((e, u) => {
			let d = [...l, u];
			if (e.type === "paragraph") {
				let o = e.numbering;
				if (o?.picBulletImagePath && o.picBulletMimeType) {
					let n = t?.(e), a = o.picBulletWidthPt ?? n?.widthPt, s = o.picBulletHeightPt ?? n?.heightPt;
					a != null && s != null && i({
						story: r,
						storyInstance: c,
						path: d
					}, o.picBulletImagePath, o.picBulletMimeType, a, s);
				}
				let s = {
					story: r,
					storyInstance: c,
					path: d
				};
				(n?.paragraphAcquisitionInput(e, s).runs ?? e.runs).forEach((e, t) => {
					(e.type === "image" || e.type === "shape") && a(e, {
						...s,
						path: [...d, t]
					});
				});
			} else e.type === "table" && o(e, r, c, d);
			if (e.type === "sectionBreak") for (let t of [
				"default",
				"first",
				"even"
			]) {
				let n = e.headers?.[t], r = e.footers?.[t];
				n && s(n.body, "header", `section:${u}:${t}`), r && s(r.body, "footer", `section:${u}:${t}`);
			}
		});
	};
	s(e.body, "body", "body");
	for (let t of [
		"default",
		"first",
		"even"
	]) {
		let n = e.headers[t], r = e.footers[t];
		n && s(n.body, "header", t), r && s(r.body, "footer", t);
	}
	for (let t of e.footnotes ?? []) s(t.content, "footnote", t.id);
	for (let t of e.endnotes ?? []) s(t.content, "endnote", t.id);
	return r;
}
//#endregion
//#region packages/docx/src/layout/runtime-state.ts
var wu = Symbol("document-layout-runtime");
function Tu(e, t) {
	Object.defineProperty(e, wu, {
		configurable: !1,
		enumerable: !1,
		writable: !1,
		value: {
			services: null,
			defaultCurrentDateMs: t
		}
	});
}
function Eu(e) {
	let t = e[wu];
	if (t) return t;
	throw Error("Document layout runtime is not initialized; attach it explicitly");
}
function Du(e) {
	let t = new Map(e), n = Object.freeze([...t.keys()].sort());
	return Object.freeze({
		keys: n,
		resolve(e) {
			let n = t.get(e);
			if (n === void 0) throw Error(`Unknown runtime resource: ${e}`);
			return n;
		}
	});
}
var Ou = /* @__PURE__ */ new WeakMap(), ku = /* @__PURE__ */ new WeakMap(), Au = /* @__PURE__ */ new WeakMap(), ju = /* @__PURE__ */ new WeakMap(), Mu = /* @__PURE__ */ new WeakMap(), Nu = /* @__PURE__ */ new WeakMap();
function Pu() {
	let e = /* @__PURE__ */ new WeakMap(), t = /* @__PURE__ */ new WeakMap(), n = 1;
	return Object.freeze({
		objectIdentity(t) {
			let r = e.get(t);
			return r === void 0 && (r = n, n += 1, e.set(t, r)), r;
		},
		get(e, n) {
			return t.get(e)?.get(n);
		},
		set(e, n, r) {
			let i = t.get(e);
			i || (i = /* @__PURE__ */ new Map(), t.set(e, i)), i.set(n, r);
		}
	});
}
function Fu(e, t) {
	let n = [
		e.text,
		e.images,
		e.math
	], r = new Set(n.flatMap((e) => {
		let t = ku.get(e);
		return t ? [t] : [];
	}));
	if (r.size > 1) throw Error("Layout services combine foreign runtime owners");
	let i = r.values().next().value, a = n.filter((e) => !ku.has(e));
	if (i && a.length > 1) throw Error("Layout services are missing service lineage for multiple components");
	if (!i && !t) return;
	let o = i ?? {};
	for (let e of n) {
		let t = ku.get(e);
		if (t && t !== o) throw Error("Layout services combine foreign runtime owners");
		ku.set(e, o);
	}
	return o;
}
function Iu(e, t) {
	let n = Fu(e, !0);
	if (Au.has(n)) throw Error("Body layout kernel is already attached");
	Au.set(n, t);
}
function Lu(e) {
	let t = Fu(e, !1);
	return t ? Au.get(t) : void 0;
}
function Ru(e, t) {
	let n = Fu(e, !0);
	if (ju.has(n)) throw Error("Vertical glyph measurement service is already attached");
	ju.set(n, t);
}
function zu(e) {
	let t = Fu(e, !1), n = t ? ju.get(t) : void 0;
	if (!n) throw Error("Vertical glyph measurement service is not attached");
	return n;
}
function Bu(e, t) {
	if (Mu.has(e)) throw Error("Layout variant store is already attached");
	Mu.set(e, t);
}
function Vu(e) {
	return Mu.get(e);
}
function Hu(e, t, n = t.keys()) {
	if (Ou.has(e)) throw Error("Private resource lookup is already attached");
	let r = new Set(t.keys()), i = new Set(n), a = [...i].filter((e) => !r.has(e)).sort(), o = [...r].filter((e) => !i.has(e)).sort();
	if (a.length > 0 || o.length > 0) throw Error(`Runtime resource membership mismatch: missing [${a.join(", ")}]; extra [${o.join(", ")}]`);
	Ou.set(e, Du(t));
}
function Uu(e) {
	return Ou.get(e);
}
var Wu = /* @__PURE__ */ new WeakMap(), Gu = /* @__PURE__ */ new WeakMap();
function Ku(e, t = {}) {
	let n = Object.freeze({
		...e,
		...t
	}), r = Lu(e);
	if (!r) throw Error("Body layout kernel is not attached to the supplied services");
	if (Lu(n) !== r) throw Error("Layout service view did not retain its body layout kernel owner");
	let i = Ou.get(e);
	i && Ou.set(n, i);
	let a = Wu.get(e);
	a && Wu.set(n, a);
	let o = Nu.get(e);
	return o && Nu.set(n, o), n;
}
function qu(e) {
	let t = Ku(e);
	return Nu.set(t, Pu()), t;
}
function Ju(e) {
	return Nu.get(e);
}
function Yu(e, t) {
	if (!Number.isInteger(t.totalPages) || t.totalPages < 1) throw RangeError("Field acquisition totalPages must be a positive integer");
	let n = Ku(e);
	return Gu.set(n, Object.freeze({ ...t })), n;
}
function Xu(e) {
	return Gu.get(e) ?? Object.freeze({ totalPages: 1 });
}
function Zu(e, t) {
	if (Wu.has(e)) throw Error("Paint resource registry is already attached");
	Wu.set(e, t);
}
function Qu(e) {
	let t = Wu.get(e);
	if (!t) throw Error("Paint resource registry is not attached");
	return t;
}
//#endregion
//#region packages/docx/src/layout/page-layers.ts
var $u = [
	"background",
	"behindText",
	"header",
	"body",
	"notes",
	"front",
	"footer"
], ed = Object.freeze({
	a: 1,
	b: 0,
	c: 0,
	d: 1,
	e: 0,
	f: 0
});
function td(e) {
	return Object.freeze({
		kind: "clip",
		clip: e
	});
}
function nd(e, t) {
	return Object.freeze({
		kind: "transform",
		transform: Object.freeze({
			...ed,
			e,
			f: t
		})
	});
}
function rd(e, t) {
	if (!t.textBoxIds?.length) return Object.freeze([]);
	let n = new Map(e.textBoxes.map((e) => [e.id, e]));
	return Object.freeze(t.textBoxIds.flatMap((e) => {
		let t = n.get(e);
		return t ? [t] : [];
	}));
}
function id(e, t, n, r, i) {
	if (e.kind === "drawing") {
		if (!e.anchorLayer) return;
		i.push(Object.freeze({
			drawing: e,
			textBoxes: Object.freeze([]),
			frames: Object.freeze([...n]),
			layoutTranslationPt: Object.freeze({ ...r }),
			encounterOrder: i.length,
			root: t
		}));
		return;
	}
	if (e.kind !== "textbox") {
		if (e.kind === "note") {
			let a = e.story.clipBounds ? Object.freeze([...n, td(e.story.clipBounds)]) : n;
			for (let n of e.story.blocks) id(n, t, a, r, i);
			return;
		}
		if (e.kind === "paragraph") {
			let a = e.clipBounds ? Object.freeze([...n, td(e.clipBounds)]) : n;
			for (let n of e.drawings) n.anchorLayer && i.push(Object.freeze({
				drawing: n,
				owner: e,
				textBoxes: rd(e, n),
				frames: Object.freeze([...a]),
				layoutTranslationPt: Object.freeze({ ...r }),
				encounterOrder: i.length,
				root: t
			}));
			return;
		}
		sd(e, t, n, r, i);
	}
}
function ad(e, t, n, r, i, a) {
	let o = t.xPt - e.flowBounds.xPt, s = t.yPt - e.flowBounds.yPt;
	id(e, n, Object.freeze([...r, nd(o, s)]), Object.freeze({
		xPt: i.xPt + o,
		yPt: i.yPt + s
	}), a);
}
function od(e, t, n, r, i) {
	ad(e.child, {
		xPt: e.xPt - r.xPt,
		yPt: e.yPt - r.yPt
	}, t, n, r, i);
}
function sd(e, t, n, r, i) {
	let a = e.clipBounds ? Object.freeze([...n, td(e.clipBounds)]) : n;
	for (let n of e.rows) for (let e of n.cells) {
		let n = "visualMergeOwnership" in e && e.visualMergeOwnership === "continuation";
		if (e.verticalMerge === "continue" && !n) continue;
		let o = e.clipBounds ? Object.freeze([...a, td(e.clipBounds)]) : a;
		for (let n of e.blocks) ad(n.layout, {
			xPt: e.contentBounds.xPt + (n.layout.kind === "table" ? n.layout.flowBounds.xPt : 0),
			yPt: e.flowBounds.yPt + n.offsetPt + (n.layout.kind === "table" ? n.layout.flowBounds.yPt : 0)
		}, t, o, r, i);
	}
	for (let n of e.resolvedFloatingTables ?? []) od(n, t, a, r, i);
}
function cd(e) {
	let t = e.drawing.anchorLayer;
	return Object.freeze({
		kind: "drawing",
		layer: t.behindDoc ? "behindText" : "front",
		sourceLayer: e.root.layer,
		rootNodeId: e.root.node.id,
		coordinateSpace: e.root.coordinateSpace,
		flowDomainId: e.root.node.flowDomainId,
		node: e.drawing,
		...e.owner ? { ownerNodeId: e.owner.id } : {},
		textBoxes: e.textBoxes,
		frames: e.frames,
		layoutTranslationPt: e.layoutTranslationPt
	});
}
function ld(e, t) {
	return Object.freeze({
		kind: "node",
		layer: e.layer,
		sourceLayer: e.layer,
		rootNodeId: e.node.id,
		coordinateSpace: e.coordinateSpace,
		flowDomainId: e.node.flowDomainId,
		node: e.node,
		omitAnchoredDrawings: t
	});
}
function ud(e, t) {
	return e.drawing.anchorLayer.relativeHeight - t.drawing.anchorLayer.relativeHeight || e.drawing.anchorLayer.sourceOrder - t.drawing.anchorLayer.sourceOrder || e.encounterOrder - t.encounterOrder;
}
function dd(e) {
	let t = [];
	for (let n of e) id(n.node, n, Object.freeze([]), Object.freeze({
		xPt: 0,
		yPt: 0
	}), t);
	let n = t.filter(({ drawing: e }) => e.anchorLayer.behindDoc).sort(ud).map(cd), r = t.filter(({ drawing: e }) => !e.anchorLayer.behindDoc).sort(ud).map(cd), i = new Set(t.map(({ root: e }) => e.node)), a = e.flatMap((e) => e.node.kind === "drawing" && e.node.anchorLayer ? [] : [ld(e, i.has(e.node))]);
	return Object.freeze([
		...n,
		...a,
		...r
	]);
}
function fd(e, t) {
	return t.has(e) || (t.add(e), e.kind === "drawing") ? !1 : e.kind === "paragraph" ? e.lines.some((e) => e.placements.some((e) => e.kind === "text" && e.paintOps?.some((e) => e.verticalFeature === !0) === !0)) || e.textBoxes.some((e) => fd(e, t)) : e.kind === "textbox" || e.kind === "note" ? e.story.blocks.some((e) => fd(e, t)) : e.rows.some((e) => e.cells.some((e) => e.blocks.some((e) => fd(e.layout, t)))) || (e.resolvedFloatingTables ?? []).some((e) => fd(e.child, t));
}
function pd(e) {
	let t = Object.freeze(e.map(({ layer: e, node: t, coordinateSpace: n }) => Object.freeze({
		layer: e,
		node: t,
		coordinateSpace: n ?? "section-logical"
	}))), n = new Map($u.map((e) => [e, []]));
	for (let e of t) n.get(e.layer).push(e.node);
	let r = [];
	for (let e = 0; e < t.length;) {
		let n = t[e].layer, i = e + 1;
		for (; t[i]?.layer === n;) i += 1;
		let a = t.slice(e, i);
		n === "header" || n === "body" || n === "notes" || n === "footer" ? r.push(...dd(a)) : r.push(...a.map((e) => ld(e, !1))), e = i;
	}
	let i = /* @__PURE__ */ new Set();
	return Object.freeze({
		roots: t,
		paintOrder: Object.freeze(r),
		capabilities: Object.freeze({ requiresElementBackedVerticalGlyphPaint: t.some(({ node: e }) => fd(e, i)) }),
		background: Object.freeze(n.get("background")),
		behindText: Object.freeze(n.get("behindText")),
		header: Object.freeze(n.get("header")),
		body: Object.freeze(n.get("body")),
		notes: Object.freeze(n.get("notes")),
		front: Object.freeze(n.get("front")),
		footer: Object.freeze(n.get("footer"))
	});
}
//#endregion
//#region packages/docx/src/layout/page-graph.ts
var md = class extends Error {
	constructor(e) {
		super(e), this.name = "PageGraphError";
	}
}, hd = pd;
function gd(e, t, n) {
	let r = new Map(n.map((e) => [e.id, e]));
	if (r.size !== n.length || n.length !== e[t].length) throw new md(`Replacement ${t} layer must preserve unique paint node identities`);
	return hd(e.roots.map((e) => {
		if (e.layer !== t) return e;
		let n = r.get(e.node.id);
		if (!n) throw new md(`Missing replacement paint node ${e.node.id}`);
		return {
			...e,
			node: n
		};
	}));
}
function _d(e) {
	return e.layers.roots;
}
function vd(e) {
	let t = !1, n = !1;
	for (let r of e.layers.roots) if (r.layer === "body") {
		if (n) throw new md(`Paint sequence must contain one contiguous body paint run; re-entered at ${r.node.id}`);
		t = !0;
	} else t && (n = !0);
	let r = /* @__PURE__ */ new Map();
	for (let t of e.layers.roots) {
		if (r.has(t.node.id)) throw new md(`Duplicate paint node ${t.node.id}`);
		r.set(t.node.id, t);
	}
	let i = /* @__PURE__ */ new Map();
	for (let t of $u) for (let n of e.layers[t]) {
		if (i.has(n.id)) throw new md(`Duplicate semantic page node ${n.id}`);
		i.set(n.id, {
			layer: t,
			node: n
		});
	}
	if (i.size !== r.size) throw new md("Semantic page layers do not match retained roots");
	for (let [e, t] of r) {
		let n = i.get(e);
		if (!n || n.layer !== t.layer || n.node !== t.node) throw new md(`Paint root ${e} is not the retained ${t.layer} node`);
	}
	let a = /* @__PURE__ */ new Set(), o = /* @__PURE__ */ new Set();
	for (let t of e.layers.paintOrder) {
		let e = r.get(t.rootNodeId);
		if (!e) throw new md(`Missing paint root ${t.rootNodeId}`);
		if (e.layer !== t.sourceLayer) throw new md(`Paint root ${t.rootNodeId} belongs to ${e.layer}, not ${t.sourceLayer}`);
		if (a.add(t.rootNodeId), t.kind === "node") {
			if (t.node !== e.node || t.node.id !== t.rootNodeId) throw new md(`Paint root ${t.rootNodeId} is not the retained ${t.sourceLayer} node`);
			continue;
		}
		if (!t.node.anchorLayer) throw new md(`Drawing paint entry ${t.node.id} is not anchored`);
		if (o.has(t.node.id)) throw new md(`Duplicate drawing paint reference ${t.node.id}`);
		o.add(t.node.id);
	}
	if (a.size !== r.size) throw new md(`Missing paint-order reference for ${[...r.keys()].find((e) => !a.has(e)) ?? "<unknown>"}`);
	return e.layers.roots.map(({ node: e }) => e);
}
//#endregion
//#region packages/docx/src/layout/error-page.ts
var yd = Object.freeze({
	story: "body",
	storyInstance: "parse-error",
	path: Object.freeze([])
});
function bd(e, t, n, r, a) {
	let o = e.trim().split(/\s+/).filter(Boolean), s = [], c = "", l = (e) => r.shape({
		text: e,
		fontSizePt: n,
		fonts: {},
		genericFamily: "sans-serif"
	}).advancePt, u = (e) => {
		let n = [
			0,
			...i(e),
			e.length
		].filter((e, t, n) => t === 0 || e !== n[t - 1]), r = n.length - 1;
		for (; r > 0 && l(`${e.slice(0, n[r])}…`) > t;) --r;
		return `${e.slice(0, n[r] ?? 0)}…`;
	}, d = () => {
		s.length === 0 ? s.push(u("")) : s[s.length - 1] = u(s[s.length - 1]);
	}, f = (e) => {
		let n = [
			0,
			...i(e),
			e.length
		].filter((e, t, n) => t === 0 || e !== n[t - 1]), r = 0;
		for (; r < n.length - 1;) {
			if (s.length >= a) return d(), !0;
			let i = r + 1;
			for (; i < n.length && l(e.slice(n[r], n[i])) <= t;) i += 1;
			let o = Math.max(r + 1, i - 1), c = e.slice(n[r], n[o]);
			if (s.length >= a - 1 && o < n.length - 1) return s.push(u(c)), !0;
			s.push(c), r = o;
		}
		return !1;
	};
	for (let e = 0; e < o.length; e += 1) {
		let n = o[e], r = c ? `${c} ${n}` : n, i = l(r);
		if (c && i > t) {
			if (s.push(c), c = "", s.length >= a) {
				d();
				break;
			}
			if (l(n) > t) {
				if (f(n)) break;
			} else c = n;
		} else if (!c && i > t) {
			if (f(n)) break;
		} else c = r;
		if (e < o.length - 1 && s.length >= a && !c) {
			d();
			break;
		}
	}
	return c && s.length < a && s.push(c), s;
}
function xd(e, t, n) {
	if (!(t.widthPt > 0 && t.heightPt > 0)) throw RangeError("Error page size must be positive");
	let r = Math.max(18, Math.min(t.widthPt, t.heightPt) * .06), i = {
		xPt: r,
		yPt: r,
		widthPt: t.widthPt - r * 2,
		heightPt: t.heightPt - r * 2
	}, a = Math.max(8, Math.min(t.widthPt, t.heightPt) * .02), o = n.resolve({
		fonts: {},
		slot: "ascii",
		genericFamily: "sans-serif"
	}).route, s = bd(e, t.widthPt - r * 4, a, n, 4), c = a * 1.4, l = [
		{
			kind: "fill-rect",
			rect: {
				xPt: 0,
				yPt: 0,
				widthPt: t.widthPt,
				heightPt: t.heightPt
			},
			fill: "#ffffff"
		},
		{
			kind: "stroke-rect",
			rect: i,
			stroke: "#c8ccd2",
			lineWidthPt: 1,
			dashPt: [6, 5]
		},
		{
			kind: "text",
			rect: {
				xPt: 0,
				yPt: t.heightPt * .27,
				widthPt: t.widthPt,
				heightPt: 36
			},
			text: "⚠",
			fill: "#b23b3b",
			fontRoute: o,
			fontSizePt: 28,
			fontWeight: 400,
			fontStyle: "normal",
			align: "center",
			baseline: "middle"
		},
		{
			kind: "text",
			rect: {
				xPt: r * 2,
				yPt: t.heightPt * .4,
				widthPt: t.widthPt - r * 4,
				heightPt: 24
			},
			text: "This document could not be displayed",
			fill: "#333333",
			fontRoute: o,
			fontSizePt: 13,
			fontWeight: 600,
			fontStyle: "normal",
			align: "center",
			baseline: "middle"
		},
		...s.map((e, n) => ({
			kind: "text",
			rect: {
				xPt: r * 2,
				yPt: t.heightPt * .5 + c * n,
				widthPt: t.widthPt - r * 4,
				heightPt: c
			},
			text: e,
			fill: "#666666",
			fontRoute: o,
			fontSizePt: a,
			fontWeight: 400,
			fontStyle: "normal",
			align: "center",
			baseline: "middle"
		}))
	], u = {
		kind: "drawing",
		id: "parse-error-page",
		source: yd,
		flowDomainId: "parse-error",
		flowBounds: i,
		inkBounds: i,
		advancePt: i.heightPt,
		ordinaryFlow: !1,
		commands: l
	}, d = {
		geometry: {
			pageWidth: t.widthPt,
			pageHeight: t.heightPt,
			marginTop: r,
			marginRight: r,
			marginBottom: r,
			marginLeft: r,
			headerDistance: 0,
			footerDistance: 0
		},
		columns: [{
			xPt: r,
			wPt: i.widthPt
		}],
		columnSeparator: !1,
		grid: {
			kind: "none",
			linePitchPt: null,
			charSpacePt: null
		},
		textDirection: "lrTb",
		verticalAlignment: "top"
	};
	return {
		pages: [{
			pageIndex: 0,
			geometry: {
				xPt: 0,
				yPt: 0,
				widthPt: t.widthPt,
				heightPt: t.heightPt,
				contentTopPt: r,
				contentBottomPt: t.heightPt - r
			},
			flowDomains: [{
				id: "parse-error",
				kind: "body",
				logicalBounds: i,
				physicalBounds: i
			}],
			section: d,
			sectionOccurrenceId: "parse-error-section",
			pageBorder: null,
			parityBlank: !1,
			bookmarkStarts: [],
			pageNumber: {
				displayNumber: 1,
				format: "decimal",
				sectionOccurrenceId: "parse-error-section"
			},
			columnSeparators: [],
			sectionRegions: [{
				id: "parse-error-region",
				sectionOccurrenceId: "parse-error-section",
				coordinateSpace: {
					writingMode: "horizontal-tb",
					logicalToPhysical: {
						a: 1,
						b: 0,
						c: 0,
						d: 1,
						e: 0,
						f: 0
					},
					physicalToLogical: {
						a: 1,
						b: 0,
						c: 0,
						d: 1,
						e: 0,
						f: 0
					}
				},
				blockStartPt: r,
				blockEndPt: t.heightPt - r,
				columnFlowDirection: "ltr",
				columnIndexes: [0],
				flowDomainIds: ["parse-error"],
				section: d
			}],
			layers: hd([{
				layer: "body",
				node: u
			}]),
			readingOrder: [u.id]
		}],
		diagnostics: [{
			code: "UNSUPPORTED_FEATURE",
			severity: "error",
			source: yd,
			message: e
		}]
	};
}
//#endregion
//#region packages/docx/src/layout/options.ts
function Sd(e, t) {
	let n = e == null ? t : typeof e == "number" ? e : e.getTime();
	if (!Number.isFinite(n)) throw RangeError("currentDate must resolve to finite epoch milliseconds");
	return Object.freeze({ currentDateMs: n });
}
function Cd(e) {
	return Sd(e.currentDate, e.defaultCurrentDateMs);
}
function wd(e, t) {
	return On("layout", {
		currentDateMs: e.currentDateMs,
		text: t.text.fingerprint,
		images: t.images.fingerprint,
		math: t.math.fingerprint,
		verticalGlyphs: t.verticalGlyphFingerprint ?? null
	});
}
//#endregion
//#region packages/docx/src/layout/coordinate-space.ts
function Td(e) {
	switch (e) {
		case "tb":
		case "tbV":
		case "lrTb":
		case "lrTbV": return "horizontal-tb";
		case "rl":
		case "rlV":
		case "tbRl":
		case "tbRlV": return "vertical-rl";
		case "btLr": return "vertical-rl";
		case "lr":
		case "lrV":
		case "tbLrV": return "vertical-lr";
		default: throw RangeError(`Unsupported Transitional text direction ${JSON.stringify(e)}`);
	}
}
function Ed(e) {
	if (!Number.isFinite(e.widthPt) || !Number.isFinite(e.heightPt) || e.widthPt <= 0 || e.heightPt <= 0) throw RangeError("Physical page extents must be positive and finite");
}
function Dd(e) {
	if (!Number.isFinite(e.xPt) || !Number.isFinite(e.yPt)) throw RangeError("Point coordinates must be finite");
}
function Od(e) {
	if (![
		e.a,
		e.b,
		e.c,
		e.d,
		e.e,
		e.f
	].every(Number.isFinite)) throw RangeError("Matrix coefficients must be finite");
}
function kd(e) {
	if (Dd(e), !Number.isFinite(e.widthPt) || !Number.isFinite(e.heightPt) || e.widthPt < 0 || e.heightPt < 0) throw RangeError("Rectangle extents must be finite and non-negative");
}
function Ad(e, t) {
	switch (Ed(e), t) {
		case "horizontal-tb": return {
			widthPt: e.widthPt,
			heightPt: e.heightPt
		};
		case "vertical-rl":
		case "vertical-lr": return {
			widthPt: e.heightPt,
			heightPt: e.widthPt
		};
		default: throw RangeError(`Unsupported writing mode ${String(t)}`);
	}
}
function jd(e, t) {
	switch (Ed(e), t) {
		case "horizontal-tb": return {
			widthPt: e.widthPt,
			heightPt: e.heightPt
		};
		case "vertical-rl":
		case "vertical-lr": return {
			widthPt: e.heightPt,
			heightPt: e.widthPt
		};
		default: throw RangeError(`Unsupported writing mode ${String(t)}`);
	}
}
function Md(e, t) {
	switch (Ed(t), e) {
		case "horizontal-tb": return {
			a: 1,
			b: 0,
			c: 0,
			d: 1,
			e: 0,
			f: 0
		};
		case "vertical-rl": return {
			a: 0,
			b: 1,
			c: -1,
			d: 0,
			e: t.widthPt,
			f: 0
		};
		case "vertical-lr": return {
			a: 0,
			b: 1,
			c: 1,
			d: 0,
			e: 0,
			f: 0
		};
		default: throw RangeError(`Unsupported writing mode ${String(e)}`);
	}
}
function Nd(e, t) {
	switch (Ed(t), e) {
		case "horizontal-tb": return {
			a: 1,
			b: 0,
			c: 0,
			d: 1,
			e: 0,
			f: 0
		};
		case "vertical-rl": return {
			a: 0,
			b: -1,
			c: 1,
			d: 0,
			e: 0,
			f: t.widthPt
		};
		case "vertical-lr": return {
			a: 0,
			b: 1,
			c: 1,
			d: 0,
			e: 0,
			f: 0
		};
		default: throw RangeError(`Unsupported writing mode ${String(e)}`);
	}
}
function Pd(e, t) {
	return Od(e), Dd(t), {
		xPt: e.a * t.xPt + e.c * t.yPt + e.e,
		yPt: e.b * t.xPt + e.d * t.yPt + e.f
	};
}
function Fd(e, t) {
	kd(t);
	let n = [
		Pd(e, t),
		Pd(e, {
			xPt: t.xPt + t.widthPt,
			yPt: t.yPt
		}),
		Pd(e, {
			xPt: t.xPt,
			yPt: t.yPt + t.heightPt
		}),
		Pd(e, {
			xPt: t.xPt + t.widthPt,
			yPt: t.yPt + t.heightPt
		})
	], r = n.map(({ xPt: e }) => e), i = n.map(({ yPt: e }) => e), a = Math.min(...r), o = Math.min(...i);
	return {
		xPt: a,
		yPt: o,
		widthPt: Math.max(...r) - a,
		heightPt: Math.max(...i) - o
	};
}
function Id(e, t) {
	Od(e);
	let n = Pd(e, {
		xPt: 0,
		yPt: 0
	}), r = {
		top: {
			xPt: 0,
			yPt: -1
		},
		right: {
			xPt: 1,
			yPt: 0
		},
		bottom: {
			xPt: 0,
			yPt: 1
		},
		left: {
			xPt: -1,
			yPt: 0
		}
	}, i = {}, a = /* @__PURE__ */ new Set();
	for (let o of [
		"top",
		"right",
		"bottom",
		"left"
	]) {
		let s = Pd(e, r[o]), c = s.xPt - n.xPt, l = s.yPt - n.yPt, u = l === 0 && c !== 0 ? c > 0 ? "right" : "left" : c === 0 && l !== 0 ? l > 0 ? "bottom" : "top" : null;
		if (u === null || a.has(u)) throw RangeError("Edge transforms require a non-degenerate axis-aligned matrix");
		i[u] = t[o], a.add(u);
	}
	if (a.size !== 4) throw RangeError("Edge transform must map every physical edge exactly once");
	return i;
}
function Ld(e, t) {
	return {
		writingMode: e,
		logicalToPhysical: Md(e, t),
		physicalToLogical: Nd(e, t)
	};
}
//#endregion
//#region packages/docx/src/layout/column-separators.ts
function Rd(e) {
	return Object.freeze(e);
}
function zd(e) {
	let t = [];
	for (let n of e) {
		let { columns: e, columnSeparator: r } = n.section;
		if (!r || e.length < 2 || n.blockEndPt <= n.blockStartPt) continue;
		let i = new Set(n.columnIndexes), a = n.columnFlowDirection === "rtl" ? e.map((e, t) => t).reverse() : e.map((e, t) => t);
		for (let r = 0; r < a.length - 1; r += 1) {
			let o = a[r];
			if (!i.has(o)) continue;
			let s = a[r + 1], c = Math.min(o, s), l = Math.max(o, s), u = e[c], d = e[l], f = (u.xPt + u.wPt + d.xPt) / 2;
			t.push(Object.freeze({
				start: Rd(Pd(n.coordinateSpace.logicalToPhysical, {
					xPt: f,
					yPt: n.blockStartPt
				})),
				end: Rd(Pd(n.coordinateSpace.logicalToPhysical, {
					xPt: f,
					yPt: n.blockEndPt
				}))
			}));
		}
	}
	return Object.freeze(t);
}
//#endregion
//#region packages/docx/src/layout/border-treatment.ts
function Bd(e, t) {
	let n = r(e, t);
	return Object.freeze({
		authoredStyle: e,
		style: e === "double" ? "double" : n.length > 0 ? "dashed" : e.includes("wave") ? "wavy" : "solid",
		dashPatternPt: Object.freeze(n)
	});
}
//#endregion
//#region packages/docx/src/layout/page-border.ts
function Vd(e, t) {
	switch (e.display) {
		case "firstPage": return t;
		case "notFirstPage": return !t;
		default: return !0;
	}
}
function Hd(e) {
	return e !== void 0 && /^[0-9a-fA-F]{6}$/.test(e) ? `#${e}` : "#000000";
}
function Ud(e) {
	return e !== void 0 && Number.isFinite(e.space) ? e.space : 0;
}
function Wd(e, t, n, r) {
	let i = Number.isFinite(e.width) ? e.width : .5;
	return Object.freeze({
		edge: t,
		from: Object.freeze(n),
		to: Object.freeze(r),
		color: Hd(e.color),
		widthPt: i,
		...Bd(e.style, i)
	});
}
function Gd(e, t, n, r) {
	if (!e || !Vd(e, r)) return null;
	let { geometry: i } = t, a = e.offsetFrom === "text", o = a ? i.marginLeft : 0, s = a ? i.pageWidth - i.marginRight : i.pageWidth, c = a ? vc(i.marginTop) : 0, l = a ? i.pageHeight - vc(i.marginBottom) : i.pageHeight, u = c + Ud(e.top), d = l - Ud(e.bottom), f = o + Ud(e.left), p = s - Ud(e.right), m = [];
	if (e.top && m.push(Wd(e.top, "top", {
		xPt: f,
		yPt: u
	}, {
		xPt: p,
		yPt: u
	})), e.bottom && m.push(Wd(e.bottom, "bottom", {
		xPt: f,
		yPt: d
	}, {
		xPt: p,
		yPt: d
	})), e.left && m.push(Wd(e.left, "left", {
		xPt: f,
		yPt: u
	}, {
		xPt: f,
		yPt: d
	})), e.right && m.push(Wd(e.right, "right", {
		xPt: p,
		yPt: u
	}, {
		xPt: p,
		yPt: d
	})), m.length === 0) return null;
	let h = Ld(Td(t.textDirection), n);
	return Object.freeze({
		zOrder: e.zOrder === "back" ? "back" : "front",
		logicalToPhysical: Object.freeze({ ...h.logicalToPhysical }),
		segments: Object.freeze(m)
	});
}
//#endregion
//#region packages/docx/src/layout/page-factory.ts
function Kd(e, t, n) {
	return `page:${e}:region:${encodeURIComponent(t)}:column:${n}`;
}
function qd(e) {
	return Jd(e), {
		xPt: 0,
		yPt: 0,
		widthPt: e.widthPt,
		heightPt: e.heightPt,
		contentTopPt: e.contentTopPt,
		contentBottomPt: e.contentBottomPt
	};
}
function Jd(e) {
	if (!Number.isFinite(e.widthPt) || !Number.isFinite(e.heightPt) || !Number.isFinite(e.contentTopPt) || !Number.isFinite(e.contentBottomPt) || e.widthPt <= 0 || e.heightPt <= 0 || e.contentTopPt < 0 || e.contentTopPt > e.contentBottomPt || e.contentBottomPt > e.heightPt) throw RangeError("Effective page edges must satisfy 0 <= contentTopPt <= contentBottomPt <= heightPt");
}
function Yd(e, t) {
	if (e.length === 0) throw RangeError(`${t} must not be empty`);
}
function Xd(e, t) {
	if (e && t === void 0) throw RangeError("Page-border finalization requires explicit section-owned page identity");
	return t ?? !1;
}
function Zd(e, t) {
	return e.length === t.length && e.every((e, n) => {
		let r = t[n];
		return r !== void 0 && e.xPt === r.xPt && e.wPt === r.wPt;
	});
}
function Qd(e, t) {
	return e === t || e !== void 0 && t !== void 0 && e.start === t.start && e.countBy === t.countBy && e.distance === t.distance && e.restart === t.restart;
}
function $d(e, t) {
	return e.geometry.pageWidth === t.geometry.pageWidth && e.geometry.pageHeight === t.geometry.pageHeight && e.geometry.marginTop === t.geometry.marginTop && e.geometry.marginRight === t.geometry.marginRight && e.geometry.marginBottom === t.geometry.marginBottom && e.geometry.marginLeft === t.geometry.marginLeft && e.geometry.headerDistance === t.geometry.headerDistance && e.geometry.footerDistance === t.geometry.footerDistance && Zd(e.columns, t.columns) && e.columnSeparator === t.columnSeparator && e.textDirection === t.textDirection && e.sectionBidi === !0 == (t.sectionBidi === !0) && e.grid.kind === t.grid.kind && e.grid.linePitchPt === t.grid.linePitchPt && e.grid.charSpacePt === t.grid.charSpacePt && e.verticalAlignment === t.verticalAlignment && Qd(e.lineNumbering, t.lineNumbering);
}
function ef(e) {
	if (Td(e.section.textDirection) !== e.writingMode) throw RangeError("Section region writing mode must agree with its section text direction");
	let t = e.section.sectionBidi === !0 ? "rtl" : "ltr";
	if (e.columnFlowDirection !== void 0 && e.columnFlowDirection !== t) throw RangeError("Section region column flow direction must agree with sectPr bidi");
	let n = e.columnIndexes ?? e.section.columns.map((e, t) => t);
	if (e.columns.length !== n.length || n.some((t, r) => !Number.isInteger(t) || t < 0 || t >= e.section.columns.length || r > 0 && t <= n[r - 1]) || e.columns.some((t, r) => {
		let i = e.section.columns[n[r]];
		return i === void 0 || t.inlineStartPt !== i.xPt || t.inlineExtentPt !== i.wPt;
	})) throw RangeError("Section region columns must equal its normalized section columns");
}
function tf(e) {
	if (!Number.isInteger(e) || e < 0) throw RangeError("Layout page index must be a non-negative integer");
}
function nf(e, t, n) {
	let r = [], i = [], a = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Set(), s = /* @__PURE__ */ new Set(), c, l = [];
	for (let u of n) {
		if (Yd(u.id, "Section region id"), Yd(u.sectionOccurrenceId, "Section occurrence id"), o.has(u.id) || s.has(u.sectionOccurrenceId)) throw RangeError("Section region and occurrence identities must be unique");
		if (o.add(u.id), s.add(u.sectionOccurrenceId), c !== void 0 && c !== u.writingMode) throw RangeError("One physical page cannot mix writing modes");
		c = u.writingMode, ef(u);
		let n = jd({
			widthPt: u.section.geometry.pageWidth,
			heightPt: u.section.geometry.pageHeight
		}, u.writingMode);
		if (n.widthPt !== t.widthPt || n.heightPt !== t.heightPt) throw RangeError(`Section regions on one physical page must use the same page box: expected ${n.widthPt}x${n.heightPt}, got ${t.widthPt}x${t.heightPt}`);
		let d = Ad(t, u.writingMode), f = d.widthPt, p = d.heightPt;
		if (!Number.isFinite(u.blockStartPt) || !Number.isFinite(u.blockEndPt) || u.blockStartPt < 0 || u.blockEndPt < u.blockStartPt || u.blockEndPt > p) throw RangeError("Section regions must be inside the logical page");
		if (u.columns.length === 0) throw RangeError("Section region must contain a column");
		let m = u.columnIndexes ?? u.section.columns.map((e, t) => t), h = 0, g = Ld(u.writingMode, t), _ = u.columns.map((t, n) => {
			let r = m[n];
			if (!Number.isFinite(t.inlineStartPt) || !Number.isFinite(t.inlineExtentPt) || t.inlineStartPt < 0 || t.inlineExtentPt <= 0 || t.inlineStartPt + t.inlineExtentPt > f || t.inlineStartPt < h) throw RangeError("Columns must be ordered, disjoint, and inside the logical page");
			h = t.inlineStartPt + t.inlineExtentPt;
			let o = Kd(e, u.id, r);
			if (a.has(o)) throw RangeError(`Duplicate flow domain ${o}`);
			let s = {
				xPt: t.inlineStartPt,
				yPt: u.blockStartPt,
				widthPt: t.inlineExtentPt,
				heightPt: u.blockEndPt - u.blockStartPt
			}, c = Fd(g.logicalToPhysical, s);
			if (l.some((e) => c.xPt < e.xPt + e.widthPt && e.xPt < c.xPt + c.widthPt && c.yPt < e.yPt + e.heightPt && e.yPt < c.yPt + c.heightPt)) throw RangeError("Section flow domains on one page must be physically disjoint");
			return l.push(c), i.push({
				id: o,
				kind: "body",
				logicalBounds: s,
				physicalBounds: c
			}), a.set(o, u.sectionOccurrenceId), o;
		});
		r.push({
			id: u.id,
			sectionOccurrenceId: u.sectionOccurrenceId,
			coordinateSpace: g,
			blockStartPt: u.blockStartPt,
			blockEndPt: u.blockEndPt,
			columnFlowDirection: u.columnFlowDirection ?? (u.section.sectionBidi === !0 ? "rtl" : "ltr"),
			columnIndexes: Object.freeze([...m]),
			flowDomainIds: _,
			section: u.section
		});
	}
	return {
		regions: r,
		domains: i,
		sectionByDomain: a
	};
}
function rf(e, t) {
	if (e.kind === "paragraph") {
		t(e), e.drawings.forEach((e) => rf(e, t)), e.textBoxes.forEach((e) => rf(e, t));
		return;
	}
	if (e.kind === "table") {
		af(e, t);
		return;
	}
	e.kind === "textbox" && of(e, t);
}
function af(e, t) {
	for (let n of e.rows) for (let e of n.cells) for (let n of e.blocks) rf(n.layout, t);
}
function of(e, t) {
	e.story.blocks.forEach((e) => rf(e, t));
}
function sf(e, t, n) {
	let r = [], i = /* @__PURE__ */ new Set();
	for (let a of e) {
		let e = n.get(a.flowDomainId) ?? t;
		rf(a, (t) => {
			for (let n of t.bookmarkStarts ?? []) !n || i.has(n) || (i.add(n), r.push({
				name: n,
				nodeId: t.id,
				sectionOccurrenceId: e
			}));
		});
	}
	return r;
}
function cf(e) {
	tf(e.pageIndex), Yd(e.sectionOccurrenceId, "Page-start section occurrence id");
	let { regions: t, domains: n, sectionByDomain: r } = nf(e.pageIndex, e.physicalPage, e.sectionRegions), i = e.sectionRegions[0], a = i?.pageBorders ?? e.pageBorders;
	if (i !== void 0 && (e.sectionOccurrenceId !== i.sectionOccurrenceId || !$d(e.section, i.section))) throw RangeError("Page-start section context must equal the first section region");
	return {
		pageIndex: e.pageIndex,
		geometry: qd(e.physicalPage),
		flowDomains: n,
		section: e.section,
		sectionOccurrenceId: e.sectionOccurrenceId,
		parityBlank: !1,
		bookmarkStarts: sf(e.paint.map(({ node: e }) => e), e.sectionOccurrenceId, r),
		pageNumber: e.pageNumber,
		sectionRegions: t,
		columnSeparators: zd(t),
		pageBorder: Gd(a, e.section, e.physicalPage, Xd(a, e.firstSectionOwnedPage)),
		layers: hd(e.paint),
		readingOrder: e.readingOrder.map((e) => e.id)
	};
}
function lf(e) {
	return tf(e.pageIndex), Yd(e.sectionOccurrenceId, "Page-start section occurrence id"), Jd(e.physicalPage), Object.freeze({
		...e,
		sectionRegions: Object.freeze([]),
		paint: Object.freeze([]),
		readingOrder: Object.freeze([])
	});
}
function uf(e, t) {
	return Object.freeze({
		...e,
		sectionRegions: Object.freeze([...e.sectionRegions, t])
	});
}
function df(e, t, n) {
	return Object.freeze({
		...e,
		paint: Object.freeze([...e.paint, t]),
		readingOrder: n ? Object.freeze([...e.readingOrder, t.node]) : e.readingOrder
	});
}
function ff(e, t, n) {
	return cf({
		...e,
		pageNumber: t,
		firstSectionOwnedPage: n
	});
}
function pf(e) {
	return tf(e.pageIndex), Yd(e.sectionOccurrenceId, "Page-start section occurrence id"), {
		pageIndex: e.pageIndex,
		geometry: qd(e.physicalPage),
		flowDomains: [],
		section: e.section,
		sectionOccurrenceId: e.sectionOccurrenceId,
		parityBlank: !0,
		bookmarkStarts: [],
		pageNumber: e.pageNumber,
		sectionRegions: [],
		columnSeparators: [],
		pageBorder: Gd(e.pageBorders, e.section, e.physicalPage, Xd(e.pageBorders, e.firstSectionOwnedPage)),
		layers: hd([]),
		readingOrder: []
	};
}
//#endregion
//#region packages/docx/src/layout/rect-union.ts
function mf(e) {
	if (e.length === 0) return null;
	let t = Math.min(...e.map((e) => e.xPt)), n = Math.min(...e.map((e) => e.yPt)), r = Math.max(...e.map((e) => e.xPt + e.widthPt)), i = Math.max(...e.map((e) => e.yPt + e.heightPt));
	return {
		xPt: t,
		yPt: n,
		widthPt: r - t,
		heightPt: i - n
	};
}
//#endregion
//#region packages/docx/src/layout/invariants.ts
var hf = {
	FLOW_OVERLAP: !0,
	BOTTOM_MARGIN_INVASION: !0,
	FLOW_DOMAIN_INVASION: !0,
	INVALID_REFERENCE: !0,
	INVALID_GEOMETRY: !0,
	INVALID_VALUE: !0,
	MISSING_RESOURCE: !0,
	NON_CONVERGENCE: !0,
	UNSUPPORTED_FEATURE: !0
}, gf = {
	body: !0,
	header: !0,
	footer: !0,
	footnote: !0,
	endnote: !0,
	textbox: !0
}, _f = new Set(Object.keys(hf)), vf = new Set(Object.keys(gf));
function yf(e, t, n = /* @__PURE__ */ new WeakSet()) {
	if (!(e === null || typeof e == "string" || typeof e == "boolean")) {
		if (typeof e == "number") {
			if (!Number.isFinite(e)) throw new J("INVALID_GEOMETRY", `${t} is not finite`);
			return;
		}
		if (typeof e != "object") throw new J("INVALID_GEOMETRY", `${t} contains ${typeof e}`);
		if (n.has(e)) throw new J("INVALID_GEOMETRY", `${t} contains a cycle`);
		n.add(e);
		try {
			if (Array.isArray(e)) {
				let r = 0;
				for (let i of Reflect.ownKeys(e)) {
					if (i === "length") continue;
					if (typeof i != "string") throw new J("INVALID_GEOMETRY", `${t} has a symbol key`);
					let a = Number(i);
					if (!Number.isInteger(a) || a < 0 || String(a) !== i || a >= e.length) throw new J("INVALID_GEOMETRY", `${t}.${i} is not an array index`);
					let o = Object.getOwnPropertyDescriptor(e, i);
					if (!o?.enumerable || !("value" in o)) throw new J("INVALID_GEOMETRY", `${t}[${i}] is not plain data`);
					yf(o.value, `${t}[${i}]`, n), r += 1;
				}
				if (r !== e.length) throw new J("INVALID_GEOMETRY", `${t} is sparse`);
				return;
			}
			let r = Object.getPrototypeOf(e);
			if (r !== Object.prototype && r !== null) throw new J("INVALID_GEOMETRY", `${t} is not a plain record`);
			for (let r of Reflect.ownKeys(e)) {
				if (typeof r != "string") throw new J("INVALID_GEOMETRY", `${t} has a symbol key`);
				let i = Object.getOwnPropertyDescriptor(e, r);
				if (!i?.enumerable || !("value" in i)) throw new J("INVALID_GEOMETRY", `${t}.${r} is not plain data`);
				yf(i.value, `${t}.${r}`, n);
			}
		} finally {
			n.delete(e);
		}
	}
}
function X(e, t) {
	if (!Number.isFinite(e)) throw new J("INVALID_GEOMETRY", `${t} is not finite`);
}
function bf(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function xf(e, t) {
	if (!bf(e)) throw new J("INVALID_GEOMETRY", `${t} is not a point`);
	X(e.xPt, `${t}.xPt`), X(e.yPt, `${t}.yPt`);
}
function Sf(e, t) {
	if (xf(e, t), X(e.widthPt, `${t}.widthPt`), X(e.heightPt, `${t}.heightPt`), e.widthPt < 0 || e.heightPt < 0) throw new J("INVALID_GEOMETRY", `${t} has a negative extent`);
}
function Cf(e, t) {
	if (!bf(e)) throw new J("INVALID_GEOMETRY", `${t} is not a matrix`);
	for (let n of [
		"a",
		"b",
		"c",
		"d",
		"e",
		"f"
	]) X(e[n], `${t}.${n}`);
}
function wf(e, t) {
	if (e !== "horizontal-tb" && e !== "vertical-rl" && e !== "vertical-lr") throw new J("INVALID_GEOMETRY", `${t} is unsupported`);
}
function Tf(e, t) {
	if (!bf(e)) throw new J("INVALID_GEOMETRY", `${t} is not a coordinate space`);
	wf(e.writingMode, `${t}.writingMode`), Cf(e.logicalToPhysical, `${t}.logicalToPhysical`), Cf(e.physicalToLogical, `${t}.physicalToLogical`);
}
function Ef(e, t) {
	let { plan: n } = e;
	if (yf(n, `${t}.plan`), X(n.rect.x, `${t}.plan.rect.x`), X(n.rect.y, `${t}.plan.rect.y`), X(n.rect.w, `${t}.plan.rect.w`), X(n.rect.h, `${t}.plan.rect.h`), n.rect.w < 0 || n.rect.h < 0) throw new J("INVALID_GEOMETRY", `${t}.plan.rect has a negative extent`);
	if (X(n.transform.rotationDeg, `${t}.plan.transform.rotationDeg`), n.geometry.kind === "preset") {
		if (n.geometry.name.length === 0) throw new J("INVALID_GEOMETRY", `${t}.plan.geometry.name is empty`);
		n.geometry.adjustments.forEach((e, n) => {
			e !== null && X(e, `${t}.plan.geometry.adjustments[${n}]`);
		});
	} else n.geometry.subpaths.forEach((e, n) => {
		e.forEach((e, r) => {
			if (e.cmd.length === 0) throw new J("INVALID_GEOMETRY", `${t}.plan.geometry.subpaths[${n}][${r}].cmd is empty`);
		});
	});
	if (n.stroke && (X(n.stroke.width, `${t}.plan.stroke.width`), n.stroke.width < 0)) throw new J("INVALID_GEOMETRY", `${t}.plan.stroke.width is negative`);
}
function Df(e, t) {
	if (e <= t) return !0;
	let n = 2 ** -52 * Math.max(1, Math.abs(e), Math.abs(t));
	return e - t <= n;
}
function Of(e, t) {
	return e < t && !Df(t, e);
}
function kf(e, t) {
	return Of(e.xPt, t.xPt + t.widthPt) && Of(t.xPt, e.xPt + e.widthPt) && Of(e.yPt, t.yPt + t.heightPt) && Of(t.yPt, e.yPt + e.heightPt);
}
function Af(e, t) {
	return Df(e.xPt, t.xPt) && Df(e.yPt, t.yPt) && Df(t.xPt + t.widthPt, e.xPt + e.widthPt) && Df(t.yPt + t.heightPt, e.yPt + e.heightPt);
}
function jf(e, t) {
	return Df(e.xPt, t.xPt) && Df(t.xPt + t.widthPt, e.xPt + e.widthPt);
}
function Mf(e, t, n) {
	return Df(e, n.yPt) && Df(n.yPt + n.heightPt, t);
}
function Nf(e, t) {
	return Df(e.yPt, t.yPt) && Df(t.yPt + t.heightPt, e.yPt + e.heightPt);
}
function Pf(e, t) {
	return e.xPt === t.xPt && e.yPt === t.yPt && e.widthPt === t.widthPt && e.heightPt === t.heightPt;
}
function Ff(e, t) {
	return e.a === t.a && e.b === t.b && e.c === t.c && e.d === t.d && e.e === t.e && e.f === t.f;
}
function If(e, t) {
	let n = e.pageBorder;
	if (n === null) return;
	if (n.zOrder !== "front" && n.zOrder !== "back") throw new J("INVALID_REFERENCE", `${t}.zOrder is invalid`);
	Cf(n.logicalToPhysical, `${t}.logicalToPhysical`);
	let r = Ld(Td(e.section.textDirection), e.geometry).logicalToPhysical;
	if (!Ff(n.logicalToPhysical, r)) throw new J("INVALID_GEOMETRY", `${t}.logicalToPhysical contradicts the page-start section`);
	if (!Array.isArray(n.segments) || n.segments.length === 0) throw new J("INVALID_GEOMETRY", `${t}.segments is empty`);
	n.segments.forEach((e, n) => {
		let r = `${t}.segments[${n}]`;
		if (xf(e.from, `${r}.from`), xf(e.to, `${r}.to`), X(e.widthPt, `${r}.widthPt`), e.from.xPt !== e.to.xPt && e.from.yPt !== e.to.yPt) throw new J("INVALID_GEOMETRY", `${r} is not an axis-aligned page edge`);
		if (!/^#[0-9a-fA-F]{6}$/.test(e.color)) throw new J("INVALID_REFERENCE", `${r}.color is invalid`);
	});
}
function Lf(e, t, n) {
	if (n.has(e)) throw new J("INVALID_REFERENCE", `duplicate retained node id ${e}`);
	n.add(e), t.add(e);
}
function Rf(e, t, n) {
	if (Lf(e.id, t, n), e.kind === "paragraph") {
		e.drawings.forEach((e) => Rf(e, t, n)), e.textBoxes.forEach((e) => Rf(e, t, n));
		return;
	}
	if (e.kind === "table") {
		e.rows.forEach((e) => {
			Lf(e.id, t, n), e.cells.forEach((e) => {
				Lf(e.id, t, n), e.blocks.forEach((e) => Rf(e.layout, t, n));
			});
		});
		return;
	}
	if (e.kind === "note") {
		e.story.blocks.forEach((e) => Rf(e, t, n));
		return;
	}
	e.kind === "textbox" && e.story.blocks.forEach((e) => Rf(e, t, n));
}
function zf(e, t) {
	if (e.kind === "paragraph") {
		let n = mf(e.drawings.filter((e) => e.anchorLayer?.cellContainment === !0).map((e) => e.flowBounds));
		if (e.cellContainmentBounds && Sf(e.cellContainmentBounds, `${t}.cellContainmentBounds`), n === null != (e.cellContainmentBounds === void 0) || n && e.cellContainmentBounds && !Pf(n, e.cellContainmentBounds)) throw new J("INVALID_GEOMETRY", `${t}.cellContainmentBounds does not match its retained layoutInCell drawings`);
		let r = /* @__PURE__ */ new Set();
		(e.anchorCollisions ?? []).forEach((e, n) => {
			let i = `${t}.anchorCollisions[${n}]`;
			if (e.occurrenceId.length === 0 || r.has(e.occurrenceId)) throw new J("INVALID_REFERENCE", `${i}.occurrenceId is empty or duplicated`);
			if (r.add(e.occurrenceId), Sf(e.bounds, `${i}.bounds`), e.horizontalOwnership !== "page" && e.horizontalOwnership !== "host" || e.verticalOwnership !== "page" && e.verticalOwnership !== "host") throw new J("INVALID_REFERENCE", `${i} has invalid axis ownership`);
		}), e.textBoxes.forEach((e, n) => zf(e, `${t}.textBoxes[${n}]`));
		return;
	}
	if (e.kind === "table") {
		e.rows.forEach((e, n) => e.cells.forEach((e, r) => e.blocks.forEach((e, i) => zf(e.layout, `${t}.rows[${n}].cells[${r}].blocks[${i}]`))));
		return;
	}
	e.kind === "textbox" && e.story.blocks.forEach((e, n) => zf(e, `${t}.story.blocks[${n}]`));
}
function Bf(e, t) {
	if (e.orientation === "upright-physical" && !e.transform) throw new J("INVALID_GEOMETRY", `${t} upright physical drawing is missing its logical transform`);
	if (e.transform) for (let n of [
		"a",
		"b",
		"c",
		"d",
		"e",
		"f"
	]) X(e.transform[n], `${t}.transform.${n}`);
	e.clip?.kind === "rect" && Sf(e.clip.rect, `${t}.clip.rect`), e.clip?.kind === "polygon" && e.clip.points.forEach((e, n) => xf(e, `${t}.clip.points[${n}]`)), e.commands.forEach((e, n) => {
		let r = `${t}.commands[${n}]`;
		if (e.kind !== "noop") {
			if (e.kind === "drawingml-shape") {
				Ef(e, r);
				return;
			}
			if (Sf(e.rect, `${r}.rect`), e.kind === "stroke-rect" && (X(e.lineWidthPt, `${r}.lineWidthPt`), e.dashPt.forEach((e, t) => X(e, `${r}.dashPt[${t}]`))), e.kind === "text" && (X(e.fontSizePt, `${r}.fontSizePt`), X(e.fontWeight, `${r}.fontWeight`)), e.kind === "watermark-text") {
				if (Sf(e.sourceBounds, `${r}.sourceBounds`), e.sourceBounds.widthPt <= 0 || e.sourceBounds.heightPt <= 0) throw new J("INVALID_GEOMETRY", `${r}.sourceBounds must have positive extents`);
				if (X(e.opacity, `${r}.opacity`), X(e.rotationDeg, `${r}.rotationDeg`), X(e.fontSizePt, `${r}.fontSizePt`), e.opacity < 0 || e.opacity > 1 || e.fontSizePt <= 0) throw new J("INVALID_GEOMETRY", `${r} has invalid textPath paint metrics`);
				e.spans.forEach((e, t) => {
					X(e.advancePt, `${r}.spans[${t}].advancePt`), X(e.fontWeight, `${r}.spans[${t}].fontWeight`);
				});
			}
		}
	});
}
function Vf(e) {
	yf(e, "layout"), e.diagnostics.forEach((e, t) => {
		let n = `diagnostics[${t}]`;
		if (!_f.has(e.code)) throw new J("INVALID_REFERENCE", `${n}.code is unknown`);
		if (e.severity !== "warning" && e.severity !== "error") throw new J("INVALID_REFERENCE", `${n}.severity is unknown`);
		if (typeof e.message != "string" || e.message.length === 0) throw new J("INVALID_REFERENCE", `${n}.message is empty`);
		if (e.source !== void 0 && (!vf.has(e.source.story) || typeof e.source.storyInstance != "string" || e.source.storyInstance.length === 0 || !Array.isArray(e.source.path) || e.source.path.some((e) => !Number.isSafeInteger(e) || e < 0))) throw new J("INVALID_REFERENCE", `${n}.source is invalid`);
	});
	let t = /* @__PURE__ */ new Set();
	e.pages.forEach((e, n) => {
		if (!Number.isInteger(e.pageIndex) || e.pageIndex !== n) throw new J("INVALID_REFERENCE", `pages[${n}] has invalid page index ${e.pageIndex}`);
		if (Sf(e.geometry, `pages[${n}].geometry`), X(e.geometry.contentTopPt, `pages[${n}].geometry.contentTopPt`), X(e.geometry.contentBottomPt, `pages[${n}].geometry.contentBottomPt`), e.geometry.widthPt <= 0 || e.geometry.heightPt <= 0 || e.geometry.contentTopPt < 0 || e.geometry.contentTopPt > e.geometry.contentBottomPt || e.geometry.contentBottomPt > e.geometry.heightPt) throw new J("INVALID_GEOMETRY", `pages[${n}] has invalid effective page edges`);
		If(e, `pages[${n}].pageBorder`);
		let r = /* @__PURE__ */ new Map();
		if (e.flowDomains.forEach((e, t) => {
			if (Sf(e.logicalBounds, `pages[${n}].flowDomains[${t}].logicalBounds`), Sf(e.physicalBounds, `pages[${n}].flowDomains[${t}].physicalBounds`), r.has(e.id)) throw new J("INVALID_REFERENCE", `duplicate flow domain ${e.id}`);
			r.set(e.id, e);
		}), e.parityBlank && (e.flowDomains.length > 0 || (e.sectionRegions?.length ?? 0) > 0 || (e.columnSeparators?.length ?? 0) > 0 || _d(e).length > 0 || e.layers.roots.length > 0 || e.readingOrder.length > 0 || (e.bookmarkStarts?.length ?? 0) > 0)) throw new J("INVALID_REFERENCE", `pages[${n}] parity blank retains page content`);
		let i = /* @__PURE__ */ new Set();
		if (e.sectionOccurrenceId !== void 0) {
			if (e.sectionOccurrenceId.length === 0) throw new J("INVALID_REFERENCE", `pages[${n}] has an empty section occurrence id`);
			i.add(e.sectionOccurrenceId);
		}
		let a = /* @__PURE__ */ new Map();
		if (e.sectionRegions) {
			let t = /* @__PURE__ */ new Set(), o = /* @__PURE__ */ new Set(), s = /* @__PURE__ */ new Map(), c = [], l;
			if (e.sectionRegions.forEach((u, d) => {
				let f = `pages[${n}].sectionRegions[${d}]`;
				if (u.id.length === 0 || t.has(u.id)) throw new J("INVALID_REFERENCE", `${f} has an invalid region id`);
				if (t.add(u.id), u.sectionOccurrenceId.length === 0) throw new J("INVALID_REFERENCE", `${f} has an empty section occurrence id`);
				if (o.has(u.sectionOccurrenceId)) throw new J("INVALID_REFERENCE", `${f} has a duplicate section occurrence id`);
				o.add(u.sectionOccurrenceId), i.add(u.sectionOccurrenceId), Tf(u.coordinateSpace, `${f}.coordinateSpace`);
				let p = u.coordinateSpace.writingMode;
				if (l !== void 0 && l !== p) throw new J("INVALID_GEOMETRY", `${f} mixes coordinate systems on one physical page`);
				l = p;
				let m;
				try {
					m = Td(u.section.textDirection);
				} catch (e) {
					throw new J("INVALID_GEOMETRY", `${f}.section.textDirection is unsupported: ${e.message}`);
				}
				if (p !== m) throw new J("INVALID_GEOMETRY", `${f} writing mode contradicts its section text direction`);
				let h = Ad(e.geometry, p), g = jd({
					widthPt: u.section.geometry.pageWidth,
					heightPt: u.section.geometry.pageHeight
				}, p);
				if (g.widthPt !== e.geometry.widthPt || g.heightPt !== e.geometry.heightPt) throw new J("INVALID_GEOMETRY", `${f} section geometry does not match the upright physical page`);
				if (X(u.blockStartPt, `${f}.blockStartPt`), X(u.blockEndPt, `${f}.blockEndPt`), u.columnFlowDirection !== "ltr" && u.columnFlowDirection !== "rtl") throw new J("INVALID_GEOMETRY", `${f} has an invalid column flow direction`);
				let _ = u.section.sectionBidi === !0 ? "rtl" : "ltr";
				if (u.columnFlowDirection !== _) throw new J("INVALID_GEOMETRY", `${f} column flow direction contradicts its section bidi`);
				if (u.blockStartPt < 0 || u.blockEndPt < u.blockStartPt || u.blockEndPt > h.heightPt) throw new J("INVALID_GEOMETRY", `${f} has an invalid block interval`);
				let v = Ld(u.coordinateSpace.writingMode, e.geometry);
				if (!Ff(u.coordinateSpace.logicalToPhysical, v.logicalToPhysical) || !Ff(u.coordinateSpace.physicalToLogical, v.physicalToLogical)) throw new J("INVALID_GEOMETRY", `${f} has an invalid coordinate transform`);
				let y = u.columnIndexes;
				if (u.flowDomainIds.length !== y.length || y.some((e, t) => !Number.isInteger(e) || e < 0 || e >= u.section.columns.length || t > 0 && e <= y[t - 1])) throw new J("INVALID_GEOMETRY", `${f} columns contradict its section`);
				let b = 0;
				u.flowDomainIds.forEach((t, n) => {
					let i = r.get(t);
					if (!i) throw new J("INVALID_REFERENCE", `${f} references missing flow domain ${t}`);
					if (i.kind !== "body") throw new J("INVALID_REFERENCE", `${f} owns non-body flow domain ${t}`);
					s.set(t, (s.get(t) ?? 0) + 1), a.set(t, u);
					let o = i.logicalBounds, l = u.section.columns[y[n]];
					if (o.widthPt <= 0 || o.heightPt < 0 || o.yPt !== u.blockStartPt || o.heightPt !== u.blockEndPt - u.blockStartPt || o.xPt < 0 || o.xPt < b || o.xPt + o.widthPt > h.widthPt || l === void 0 || o.xPt !== l.xPt || o.widthPt !== l.wPt) throw new J("INVALID_GEOMETRY", `${t} is not the section column's non-negative logical region`);
					if (b = o.xPt + o.widthPt, !Pf(Fd(u.coordinateSpace.logicalToPhysical, i.logicalBounds), i.physicalBounds)) throw new J("INVALID_GEOMETRY", `${t} physical bounds do not match its section region transform`);
					if (!Af(e.geometry, i.physicalBounds)) throw new J("INVALID_GEOMETRY", `${t} physical bounds leave the upright physical page`);
					if (c.some((e) => e.regionId !== u.id && kf(e.bounds, i.physicalBounds))) throw new J("INVALID_GEOMETRY", `${t} overlaps a body flow domain owned by another section region`);
					c.push({
						regionId: u.id,
						bounds: i.physicalBounds
					});
				});
			}), e.flowDomains.filter((e) => e.kind === "body").forEach((e) => {
				if (s.get(e.id) !== 1) throw new J("INVALID_REFERENCE", `${e.id} has invalid section region ownership`);
			}), !e.parityBlank && e.sectionRegions.length > 0) {
				let t = e.sectionRegions[0];
				if (e.sectionOccurrenceId !== t.sectionOccurrenceId) throw new J("INVALID_REFERENCE", `pages[${n}] page-start section occurrence does not match its first region`);
				if (!$d(e.section, t.section)) throw new J("INVALID_GEOMETRY", `pages[${n}] page-start section facts do not match its first region`);
			}
		}
		let o = zd(e.sectionRegions ?? []);
		if (!Array.isArray(e.columnSeparators) || e.columnSeparators.length !== o.length || e.columnSeparators.some((e, t) => {
			let n = o[t];
			return n === void 0 || e.start.xPt !== n.start.xPt || e.start.yPt !== n.start.yPt || e.end.xPt !== n.end.xPt || e.end.yPt !== n.end.yPt;
		})) throw new J("INVALID_GEOMETRY", `pages[${n}].columnSeparators contradict the retained section regions`);
		let s = new Map(e.sectionRegions.map((e) => [e.id, e]));
		for (let t of e.flowDomains) {
			if (t.kind !== "footnote" && t.kind !== "endnote") continue;
			let n = t.sectionRegionId ? s.get(t.sectionRegionId) : e.sectionRegions[0];
			if (!n) throw new J("INVALID_REFERENCE", `${t.id} references missing page story region ${t.sectionRegionId ?? "<default>"}`);
			if (!Pf(Fd(n.coordinateSpace.logicalToPhysical, t.logicalBounds), t.physicalBounds)) throw new J("INVALID_GEOMETRY", `${t.id} physical bounds do not match the page story transform`);
			a.set(t.id, n);
		}
		for (let t of e.flowDomains) if (!a.has(t.id) && !Pf(t.logicalBounds, t.physicalBounds)) throw new J("INVALID_GEOMETRY", `${t.id} has unequal logical and physical bounds without a section region`);
		if (e.pageNumber) {
			if (X(e.pageNumber.displayNumber, `pages[${n}].pageNumber.displayNumber`), !Number.isInteger(e.pageNumber.displayNumber)) throw new J("INVALID_GEOMETRY", `pages[${n}] page number is not an integer`);
			if (e.pageNumber.format.length === 0 || !i.has(e.pageNumber.sectionOccurrenceId)) throw new J("INVALID_REFERENCE", `pages[${n}] has an invalid page number section owner`);
		}
		let c = [];
		try {
			vd(e);
		} catch (e) {
			throw e instanceof md ? new J("INVALID_REFERENCE", e.message) : e;
		}
		let l = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new Set();
		_d(e).forEach(({ node: e }, i) => {
			let o = `pages[${n}].nodes[${i}]`;
			l.set(e.id, e), Rf(e, u, t), zf(e, o), Sf(e.flowBounds, `${o}.flowBounds`), Sf(e.inkBounds, `${o}.inkBounds`), e.clipBounds && Sf(e.clipBounds, `${o}.clipBounds`), X(e.advancePt, `${o}.advancePt`), e.kind === "drawing" && Bf(e, o);
			let s = r.get(e.flowDomainId);
			if (!s) throw new J("INVALID_REFERENCE", `${e.id} references missing flow domain ${e.flowDomainId}`);
			if (e.ordinaryFlow && s.kind === "body" && s.logicalBounds.heightPt === 0) throw new J("FLOW_DOMAIN_INVASION", `${e.id} claims ordinary flow in an empty body domain`);
			if (!e.ordinaryFlow) return;
			let d = s.kind === "body" ? a.get(s.id) : void 0;
			if (s.kind === "body") {
				if (!d) throw new J("INVALID_REFERENCE", `${e.id} references a body flow domain without a section region`);
				if (e.flowBounds.yPt + e.flowBounds.heightPt > d.blockEndPt) throw new J("BOTTOM_MARGIN_INVASION", `${e.id} crosses logical block end`);
			}
			if (!(d ? Mf(d.blockStartPt, d.blockEndPt, e.flowBounds) && (e.kind === "table" || jf(s.logicalBounds, e.flowBounds)) : e.kind === "table" ? Nf(s.logicalBounds, e.flowBounds) : Af(s.logicalBounds, e.flowBounds))) throw new J("FLOW_DOMAIN_INVASION", `${e.id} crosses flow domain ${s.id}`);
			c.push(e);
		});
		let d = /* @__PURE__ */ new Set();
		if (e.readingOrder.forEach((e) => {
			if (!l.has(e) || d.has(e)) throw new J("INVALID_REFERENCE", `invalid reading-order reference ${e}`);
			d.add(e);
		}), e.bookmarkStarts !== void 0) {
			let t = new Map([...a].map(([e, t]) => [e, t.sectionOccurrenceId])), r = sf(vd(e), e.sectionOccurrenceId ?? "", t), o = r.every((e) => e.sectionOccurrenceId.length > 0 && i.has(e.sectionOccurrenceId)), s = e.bookmarkStarts.length === r.length && e.bookmarkStarts.every((e, t) => {
				let n = r[t];
				return n !== void 0 && e.name === n.name && e.nodeId === n.nodeId && e.sectionOccurrenceId === n.sectionOccurrenceId;
			});
			if (!o || !s) throw new J("INVALID_REFERENCE", `pages[${n}] bookmark metadata does not match its retained graph (invalid bookmark node or ownership)`);
		}
		for (let e = 0; e < c.length; e += 1) for (let t = e + 1; t < c.length; t += 1) {
			let n = c[e], i = c[t];
			if (!n || !i) continue;
			let a = r.get(n.flowDomainId), o = r.get(i.flowDomainId), s = n.flowDomainId === i.flowDomainId, l = a?.kind === "body" && (o?.kind === "footnote" || o?.kind === "endnote") || o?.kind === "body" && (a?.kind === "footnote" || a?.kind === "endnote"), u = a?.id !== o?.id && (a?.kind === "footnote" || a?.kind === "endnote") && (o?.kind === "footnote" || o?.kind === "endnote");
			if ((s || l || u) && kf(n.flowBounds, i.flowBounds)) throw new J("FLOW_OVERLAP", `${n.id} overlaps ${i.id}`);
		}
	});
}
function Hf(e) {
	try {
		Vf(e);
	} catch (e) {
		throw e instanceof J ? e : e instanceof TypeError || e instanceof RangeError ? new J("INVALID_GEOMETRY", e.message) : e;
	}
}
function Uf(e, t) {
	if (typeof e != "object" || !e || t.has(e)) return e;
	t.add(e);
	for (let n of Object.values(e)) Uf(n, t);
	return Object.freeze(e);
}
var Wf = /* @__PURE__ */ new WeakSet(), Gf = /* @__PURE__ */ new WeakSet();
function Kf(e) {
	if (Wf.has(e)) return e;
	let t = Uf(e, /* @__PURE__ */ new WeakSet());
	return Wf.add(t), t;
}
function qf(e) {
	return Wf.has(e) ? e : (yf(e, "layout"), Kf(e));
}
function Jf(e) {
	if (Gf.has(e)) return e;
	Hf(e);
	let t = Kf(e);
	return Gf.add(t), t;
}
//#endregion
//#region packages/docx/src/layout/variant-store.ts
function Yf(e, t) {
	if (!Number.isInteger(t) || t < 0 || t >= e.pages.length) throw RangeError(`Page index ${t} out of range (count: ${e.pages.length})`);
	return e.pages[t];
}
var Xf = class {
	#e;
	#t;
	#n = /* @__PURE__ */ new Map();
	#r;
	#i;
	#a = null;
	constructor(e, t, n) {
		this.#e = e, this.#r = Object.freeze({ ...t }), this.#i = wd(this.#r, this.#e), this.#t = n;
	}
	get defaultLayout() {
		return this.layoutFor(this.#r);
	}
	layoutFor(e) {
		return this.select(e).layout;
	}
	select(e) {
		let t = Object.isFrozen(e) ? e : Object.freeze({ ...e }), n = wd(t, this.#e), r = this.#n.get(n);
		return r || (r = qf(this.#t(t)), n !== this.#i && (this.#a !== null && this.#a !== n && this.#n.delete(this.#a), this.#a = n), this.#n.set(n, r)), Object.freeze({
			key: n,
			options: t,
			layout: r
		});
	}
	selectPage(e, t) {
		let n = this.select(e);
		return Object.freeze({
			...n,
			page: Yf(n.layout, t)
		});
	}
	isDefault(e) {
		return wd(e, this.#e) === this.#i;
	}
};
//#endregion
//#region packages/docx/src/layout/document-layout-variants.ts
function Zf({ model: e, services: t, defaultCurrentDateMs: n, buildLayout: r }) {
	let i = Cd({ defaultCurrentDateMs: n }), a = e.parseError === void 0 ? null : xd(e.parseError, {
		widthPt: e.section.pageWidth,
		heightPt: e.section.pageHeight
	}, t.text), o = new Xf(t, i, a === null ? r : () => a);
	return Bu(t, o), Object.freeze({
		store: o,
		defaultOptions: i
	});
}
function Qf(e, t, n) {
	let r = Vu(e);
	if (!r) throw Error("Document layout variant store is not attached to the supplied services");
	return r.selectPage(Cd(t), n);
}
//#endregion
//#region packages/docx/src/layout/affine.ts
function $f(e, t) {
	return Object.freeze({
		a: e.a * t.a + e.c * t.b,
		b: e.b * t.a + e.d * t.b,
		c: e.a * t.c + e.c * t.d,
		d: e.b * t.c + e.d * t.d,
		e: e.a * t.e + e.c * t.f + e.e,
		f: e.b * t.e + e.d * t.f + e.f
	});
}
function ep(e) {
	return Object.freeze({
		a: e,
		b: 0,
		c: 0,
		d: e,
		e: 0,
		f: 0
	});
}
function tp(e, t) {
	return Object.freeze({
		a: 1,
		b: 0,
		c: 0,
		d: 1,
		e,
		f: t
	});
}
function np(e, t) {
	return {
		xPt: e.a * t.xPt + e.c * t.yPt + e.e,
		yPt: e.b * t.xPt + e.d * t.yPt + e.f
	};
}
function rp(e, t) {
	let n = e.a * e.d - e.b * e.c;
	if (!Number.isFinite(n) || n === 0) return null;
	let r = t.xPt - e.e, i = t.yPt - e.f, a = {
		xPt: (e.d * r - e.c * i) / n,
		yPt: (-e.b * r + e.a * i) / n
	};
	return Number.isFinite(a.xPt) && Number.isFinite(a.yPt) ? a : null;
}
function ip(e, t) {
	let n = e.a * e.d - e.b * e.c;
	if (!Number.isFinite(n) || n === 0) return null;
	let r = {
		xPt: (e.d * t.xPt - e.c * t.yPt) / n,
		yPt: (-e.b * t.xPt + e.a * t.yPt) / n
	};
	return Number.isFinite(r.xPt) && Number.isFinite(r.yPt) ? r : null;
}
//#endregion
//#region packages/docx/src/layout/text-index.ts
var ap = Object.freeze({
	a: 1,
	b: 0,
	c: 0,
	d: 1,
	e: 0,
	f: 0
});
function op(e) {
	let t = new Map(e.sectionRegions.map((e) => [e.id, e])), n = /* @__PURE__ */ new Map();
	for (let t of e.sectionRegions) for (let e of t.flowDomainIds) n.set(e, t);
	for (let r of e.flowDomains) {
		if (r.kind !== "footnote" && r.kind !== "endnote") continue;
		let i = r.sectionRegionId ? t.get(r.sectionRegionId) : e.sectionRegions[0];
		if (!i) throw Error(`${r.id} references missing page story region ${r.sectionRegionId ?? "<default>"}`);
		n.set(r.id, i);
	}
	return n;
}
function sp(e, t) {
	return t.coordinateSpace === "upright-physical" ? ap : e.get(t.node.flowDomainId)?.coordinateSpace.logicalToPhysical ?? ap;
}
function cp(e, t) {
	let n = e.rootPointToPage.get(t.rootNodeId);
	if (!n) throw Error(`Drawing entry ${t.node.id} references missing root ${t.rootNodeId}`);
	let r = n;
	for (let e of t.frames) e.kind === "transform" && (r = $f(r, e.transform));
	return r;
}
function lp(e, t, n) {
	let r = t.xPt - e.flowBounds.xPt, i = t.yPt - e.flowBounds.yPt;
	return {
		pointToPage: $f(n.pointToPage, tp(r, i)),
		layoutTranslationPt: {
			xPt: n.layoutTranslationPt.xPt + r,
			yPt: n.layoutTranslationPt.yPt + i
		},
		rootNodeId: n.rootNodeId
	};
}
function up(e, t) {
	return (t.textBoxIds ?? []).flatMap((t) => {
		let n = e.get(t);
		return n ? [n] : [];
	});
}
function dp(e, t, n) {
	if (n.emittedTextBoxes.has(e.id)) return;
	n.emittedTextBoxes.add(e.id);
	let r = {
		...t,
		pointToPage: $f(t.pointToPage, e.transform)
	};
	for (let t of e.story.blocks) gp(t, r, n);
}
function fp(e, t, n, r) {
	let i = up(e, t);
	if (i.length === 0) return;
	let a = pp(t, n, r);
	for (let e of i) dp(e, a, r);
}
function pp(e, t, n) {
	let r = n.drawingEntries.get(e.id), i = t;
	r && r.rootNodeId === t.rootNodeId && (i = {
		pointToPage: cp(n, r),
		layoutTranslationPt: r.layoutTranslationPt,
		rootNodeId: r.rootNodeId
	});
	let a = i.layoutTranslationPt, o = e.anchorLayer?.horizontalOwnership === "page" ? -a.xPt : 0, s = e.anchorLayer?.verticalOwnership === "page" ? -a.yPt : 0, c = o === 0 && s === 0 ? i : {
		...i,
		pointToPage: $f(i.pointToPage, tp(o, s))
	};
	if (e.orientation === "upright-physical") {
		if (!e.transform) throw Error(`Upright physical drawing ${e.id} is missing its logical transform`);
		c = {
			...c,
			pointToPage: $f(c.pointToPage, e.transform)
		};
	}
	return c;
}
function mp(e, t, n) {
	for (let r of e.lines) for (let i of r.placements) i.kind === "text" && n.runs.push(Object.freeze({
		placement: i,
		pointToPage: t.pointToPage,
		...e.paragraphId === void 0 ? {} : { paragraphId: e.paragraphId }
	}));
	let r = new Map(e.textBoxes.map((e) => [e.id, e])), i = /* @__PURE__ */ new Set(), a = e.drawings.map((e, t) => {
		let n = e.source.path.at(-1);
		if (n === void 0 || !Number.isSafeInteger(n) || n < 0) throw Error(`Drawing ${e.id} has no retained paragraph run index`);
		return {
			drawing: e,
			index: t,
			runIndex: n
		};
	}).sort((e, t) => e.runIndex - t.runIndex || e.index - t.index);
	for (let { drawing: e } of a) {
		for (let t of e.textBoxIds ?? []) i.add(t);
		fp(r, e, t, n);
	}
	for (let r of e.textBoxes) i.has(r.id) || dp(r, t, n);
}
function hp(e, t, n) {
	for (let r of e.rows) for (let e of r.cells) {
		let r = "visualMergeOwnership" in e && e.visualMergeOwnership === "continuation";
		if (!(e.verticalMerge === "continue" && !r)) for (let r of e.blocks) {
			let i = r.layout;
			gp(i, lp(i, {
				xPt: e.contentBounds.xPt + (i.kind === "table" ? i.flowBounds.xPt : 0),
				yPt: e.flowBounds.yPt + r.offsetPt + (i.kind === "table" ? i.flowBounds.yPt : 0)
			}, t), n);
		}
	}
	for (let r of e.resolvedFloatingTables ?? []) gp(r.child, lp(r.child, {
		xPt: r.xPt - t.layoutTranslationPt.xPt,
		yPt: r.yPt - t.layoutTranslationPt.yPt
	}, t), n);
}
function gp(e, t, n) {
	switch (e.kind) {
		case "paragraph":
			mp(e, t, n);
			return;
		case "table":
			hp(e, t, n);
			return;
		case "note":
			for (let r of e.story.blocks) gp(r, t, n);
			return;
		case "textbox":
			dp(e, t, n);
			return;
		case "drawing": {
			let r = n.drawingEntries.get(e.id), i = pp(e, t, n);
			for (let e of r?.textBoxes ?? []) dp(e, i, n);
			return;
		}
		default: throw Error(`Unknown text-index node: ${String(e)}`);
	}
}
function _p(e, t) {
	let n = e.pages[t];
	if (!n) throw RangeError(`Page index ${t} is out of range`);
	let r = new Map(n.layers.roots.map((e) => [e.node.id, e])), i = op(n), a = new Map(n.layers.roots.map((e) => [e.node.id, sp(i, e)])), o = /* @__PURE__ */ new Map();
	for (let e of n.layers.paintOrder) e.kind === "drawing" && o.set(e.node.id, e);
	let s = {
		drawingEntries: o,
		rootPointToPage: a,
		emittedTextBoxes: /* @__PURE__ */ new Set(),
		runs: []
	};
	for (let e of n.readingOrder) {
		let t = r.get(e);
		if (!t) throw Error(`Reading-order node ${e} is not a page root`);
		let n = a.get(e);
		if (!n) throw Error(`Reading-order node ${e} has no page projection`);
		gp(t.node, {
			pointToPage: n,
			layoutTranslationPt: {
				xPt: 0,
				yPt: 0
			},
			rootNodeId: t.node.id
		}, s);
	}
	return Object.freeze(s.runs);
}
//#endregion
//#region packages/docx/src/paint/affine.ts
function vp(e) {
	let t = Math.hypot(e.a, e.b), n = Math.hypot(e.c, e.d), r = e.a / t, i = e.b / t, a = e.c / n, o = e.d / n;
	if (!(r === 1 && i === 0 && a === 0 && o === 1)) return r === 0 && i === 1 && a === -1 && o === 0 ? "rotate(90deg)" : r === 0 && i === -1 && a === 1 && o === 0 ? "rotate(-90deg)" : `matrix(${r}, ${i}, ${a}, ${o}, 0, 0)`;
}
//#endregion
//#region packages/docx/src/text-run-projection.ts
function yp(e, t) {
	let { placement: n } = e, r = np(t, n.bounds), i = Math.hypot(t.a, t.b), a = Math.hypot(t.c, t.d), o = vp(t), s = n.paintOps[0]?.letterSpacingPt ?? 0;
	return {
		...e.paragraphId === void 0 ? {} : { paragraphId: e.paragraphId },
		text: n.text,
		x: r.xPt,
		y: r.yPt,
		w: n.bounds.widthPt * i,
		h: n.bounds.heightPt * a,
		fontSize: n.fontSizePt * a,
		font: at(n.fontRoute, n.fontSizePt * a, n.fontWeight, n.fontStyle),
		...s === 0 ? {} : { letterSpacingPx: s * i },
		...o ? { transform: o } : {},
		...n.hyperlink ? { hyperlink: n.hyperlink } : {},
		...n.tateChuYoko ? { eastAsianVert: !0 } : {}
	};
}
function bp(e, t, n) {
	if (!Number.isFinite(n.scale) || n.scale <= 0) throw RangeError(`Text projection scale must be positive: ${n.scale}`);
	let r = ep(n.scale);
	return _p(e, t).map((e) => yp(e, $f(r, e.pointToPage)));
}
function xp(e, t, n) {
	let r = Qf(e, {
		currentDate: n.currentDate,
		defaultCurrentDateMs: n.defaultCurrentDateMs
	}, t), i = (n.width ?? r.page.geometry.widthPt * 1.3333333333333333) / r.page.geometry.widthPt;
	return bp(r.layout, t, { scale: i });
}
//#endregion
//#region packages/docx/src/paint/browser-images.ts
function Sp(e, t, n) {
	return `${e}${t ? `|clr:${t}` : ""}${n ? `|duo:${n.clr1}:${n.clr2}` : ""}`;
}
var Cp = /* @__PURE__ */ new WeakMap();
function wp(e) {
	let t = Cp.get(e);
	return t || (t = /* @__PURE__ */ new Map(), Cp.set(e, t)), t;
}
function Tp(e) {
	let t = Cp.get(e);
	if (t) {
		for (let n of t.values()) he(e, n);
		t.clear(), Cp.delete(e);
	}
}
async function Ep(e, t) {
	let n = parseInt(t.slice(0, 2), 16), r = parseInt(t.slice(2, 4), 16), i = parseInt(t.slice(4, 6), 16), a = new OffscreenCanvas(e.width, e.height), o = a.getContext("2d");
	if (!o) throw Error("2D canvas is unavailable for image color replacement");
	o.drawImage(e, 0, 0);
	let s = o.getImageData(0, 0, e.width, e.height);
	for (let e = 0; e < s.data.length; e += 4) s.data[e] === n && s.data[e + 1] === r && s.data[e + 2] === i && (s.data[e + 3] = 0);
	return o.putImageData(s, 0, 0), createImageBitmap(a);
}
async function Dp(e, t, n, r, i = 0, a = 0, o) {
	let s = await Ce(e, t, r, {
		widthPt: i,
		heightPt: a,
		suppressBoundaryFrame: !0
	});
	if (!s) return null;
	if (!n && !o) return s;
	let c = wp(r), l = Sp(e, n, o), u = c.get(l);
	return u || (u = (async () => {
		let e = s;
		if (n && (e = await Ep(e, n)), o) {
			let { w: t, h: n } = Ae(e);
			t > 0 && n > 0 && (e = await I(e, o, {
				width: t,
				height: n
			}));
		}
		return e;
	})(), u.catch(() => c.delete(l)), u.then((e) => {
		e === s && c.delete(l);
	}).catch(() => {}), c.set(l, u)), u;
}
function Op(e) {
	let t = /* @__PURE__ */ new Map(), n = e.filter((e) => e.kind === "image" || e.kind === "picture-bullet").sort((e, t) => (e.documentOrder ?? 2 ** 53 - 1) - (t.documentOrder ?? 2 ** 53 - 1));
	for (let e of n) {
		let n = Se(e.mimeType, e.srcRect, e.intrinsicSize.widthPt, e.intrinsicSize.heightPt), r = {
			imagePath: e.partPath,
			mimeType: e.mimeType,
			...e.svgImagePath === void 0 ? {} : { svgImagePath: e.svgImagePath },
			...e.colorReplaceFrom === void 0 ? {} : { colorReplaceFrom: e.colorReplaceFrom },
			...e.duotone === void 0 ? {} : { duotone: e.duotone },
			widthPt: n.widthPt,
			heightPt: n.heightPt,
			hasCrop: e.srcRect != null
		}, i = Sp(r.imagePath, r.colorReplaceFrom, r.duotone), a = t.get(i);
		a ? (a.widthPt = Math.max(a.widthPt, r.widthPt), a.heightPt = Math.max(a.heightPt, r.heightPt), a.hasCrop ||= r.hasCrop) : t.set(i, r);
	}
	return [...t.values()];
}
async function kp(e, t) {
	if (!t) return /* @__PURE__ */ new Map();
	let n = await Promise.all(Op(e).map(async (e) => {
		let n = e.mimeType === "image/svg+xml", r = {
			svgImagePath: e.svgImagePath,
			srcRect: e.hasCrop || null
		}, i;
		if (L(r)) try {
			i = await Me(r.svgImagePath, t);
		} catch (r) {
			let a = n ? await Me(e.imagePath, t) : await Dp(e.imagePath, e.mimeType, e.colorReplaceFrom, t, e.widthPt, e.heightPt, e.duotone);
			if (!a) throw r;
			i = a;
		}
		else i = n ? await Me(e.imagePath, t) : await Dp(e.imagePath, e.mimeType, e.colorReplaceFrom, t, e.widthPt, e.heightPt, e.duotone);
		return i == null ? null : [Sp(e.imagePath, e.colorReplaceFrom, e.duotone), i];
	}));
	return new Map(n.filter((e) => e !== null));
}
//#endregion
//#region packages/docx/src/paint/column-separator-raster.ts
function Ap(e, t) {
	return Math.round(e * t) / t;
}
function jp(e, t, n) {
	let r = e * t;
	return (n % 2 == 0 ? Math.round(r) : Math.round(r - .5) + .5) / t;
}
function Mp(e, t, n) {
	let r = t * n, i = Math.max(1, Math.round(.5 * t)), a = Math.max(1, Math.round(i * n)), o = a / r;
	if (e.start.xPt === e.end.xPt) {
		let t = jp(e.start.xPt, r, a);
		return {
			segment: {
				start: {
					xPt: t,
					yPt: Ap(e.start.yPt, r)
				},
				end: {
					xPt: t,
					yPt: Ap(e.end.yPt, r)
				}
			},
			widthPt: o
		};
	}
	if (e.start.yPt === e.end.yPt) {
		let t = jp(e.start.yPt, r, a);
		return {
			segment: {
				start: {
					xPt: Ap(e.start.xPt, r),
					yPt: t
				},
				end: {
					xPt: Ap(e.end.xPt, r),
					yPt: t
				}
			},
			widthPt: o
		};
	}
	return {
		segment: e,
		widthPt: o
	};
}
//#endregion
//#region packages/docx/src/paint/canvas-resource.ts
function Np(e, t, n, r, i) {
	if (r !== "upright-physical") {
		i.resources.paint(e, t, n, i.ctx);
		return;
	}
	let { ctx: a } = i;
	a.save(), a.translate(n.xPt + n.widthPt / 2, n.yPt + n.heightPt / 2), a.rotate(-Math.PI / 2), i.resources.paint(e, t, {
		xPt: -n.heightPt / 2,
		yPt: -n.widthPt / 2,
		widthPt: n.heightPt,
		heightPt: n.widthPt
	}, a), a.restore();
}
//#endregion
//#region packages/docx/src/paint/canvas-drawing.ts
function Pp(e, t) {
	for (let n of e.commands) {
		if (n.kind === "noop") continue;
		if (n.kind === "drawingml-shape") {
			dt(t.ctx, n.plan, 1);
			continue;
		}
		if (n.kind === "resource") {
			if (!t.resources) throw Error(`Missing retained resource painter for ${n.resourceKey}`);
			Np(n.resourceKey, n.resourceKind, n.rect, n.orientation, t);
			continue;
		}
		if (n.kind === "fill-rect") {
			t.ctx.fillStyle = n.fill, t.ctx.fillRect(n.rect.xPt, n.rect.yPt, n.rect.widthPt, n.rect.heightPt);
			continue;
		}
		if (n.kind === "stroke-rect") {
			t.ctx.strokeStyle = n.stroke, t.ctx.lineWidth = n.lineWidthPt, t.ctx.setLineDash([...n.dashPt]), t.ctx.strokeRect(n.rect.xPt, n.rect.yPt, n.rect.widthPt, n.rect.heightPt), t.ctx.setLineDash([]);
			continue;
		}
		if (n.kind === "watermark-text") {
			let e = k(n.fill, t.ctx, n.rect.xPt, n.rect.yPt, n.rect.widthPt, n.rect.heightPt);
			if (e === null) continue;
			t.ctx.save();
			let r = n.rect.xPt + n.rect.widthPt / 2, i = n.rect.yPt + n.rect.heightPt / 2;
			t.ctx.translate(r, i), n.rotationDeg !== 0 && t.ctx.rotate(n.rotationDeg * Math.PI / 180), n.fitShape ? (t.ctx.scale(n.rect.widthPt / n.sourceBounds.widthPt, n.rect.heightPt / n.sourceBounds.heightPt), t.ctx.translate(-(n.sourceBounds.xPt + n.sourceBounds.widthPt / 2), -(n.sourceBounds.yPt + n.sourceBounds.heightPt / 2))) : t.ctx.translate(n.rect.xPt - r - n.sourceBounds.xPt, n.rect.yPt - i - n.sourceBounds.yPt), t.ctx.globalAlpha *= n.opacity, t.ctx.fillStyle = e, t.ctx.textAlign = "left", t.ctx.textBaseline = "alphabetic";
			let a = 0;
			for (let e of n.spans) t.ctx.font = at(e.fontRoute, n.fontSizePt, e.fontWeight, e.fontStyle), t.ctx.fillText(e.text, a, 0), a += e.advancePt;
			t.ctx.restore();
			continue;
		}
		t.ctx.fillStyle = n.fill, t.ctx.font = at(n.fontRoute, n.fontSizePt, n.fontWeight, n.fontStyle), t.ctx.textAlign = n.align === "start" ? "left" : n.align === "end" ? "right" : "center", t.ctx.textBaseline = n.baseline;
		let e = n.align === "start" ? n.rect.xPt : n.align === "end" ? n.rect.xPt + n.rect.widthPt : n.rect.xPt + n.rect.widthPt / 2, r = n.baseline === "top" ? n.rect.yPt : n.baseline === "bottom" ? n.rect.yPt + n.rect.heightPt : n.rect.yPt + n.rect.heightPt / 2;
		t.ctx.fillText(n.text, e, r);
	}
}
//#endregion
//#region packages/docx/src/paint/canvas-border.ts
function Fp(e) {
	return 1 / e.dpr;
}
function Ip(e, t, n = 0) {
	let i = n / t.scale, a = i > e.widthPt ? {
		...e,
		widthPt: i,
		...typeof e.authoredStyle == "string" ? { dashPatternPt: Object.freeze(r(e.authoredStyle, i)) } : {}
	} : e, { ctx: o } = t;
	o.strokeStyle = a.color, o.lineWidth = a.widthPt, o.setLineDash("dashPatternPt" in a && a.dashPatternPt ? [...a.dashPatternPt] : []), o.beginPath();
	let c = "path" in a && a.path?.length ? a.path : [a.from, a.to], l = c.length === 2 && (c[0].xPt === c[1].xPt || c[0].yPt === c[1].yPt), u = l && c[0].yPt === c[1].yPt, d = l && c[0].xPt === c[1].xPt, f = t.pointToCss ?? ep(t.scale), p = c.map((e) => np(f, e)), m = l ? c[1].xPt - c[0].xPt : 0, h = l ? c[1].yPt - c[0].yPt : 0, g = f.a * m + f.c * h, _ = f.b * m + f.d * h, v = l && _ === 0, y = l && g === 0, b = u ? Math.hypot(f.c, f.d) : d ? Math.hypot(f.a, f.b) : 0;
	if (a.style === "double" && l && b > 0) {
		if (o.fillStyle = a.color, v || y) {
			let e = (e, t, n, r) => {
				let i = [
					{
						xPt: e,
						yPt: t
					},
					{
						xPt: e + n,
						yPt: t
					},
					{
						xPt: e,
						yPt: t + r
					},
					{
						xPt: e + n,
						yPt: t + r
					}
				].map((e) => rp(f, e));
				if (i.some((e) => e === null)) return;
				let a = i.filter((e) => e !== null), s = a.map((e) => e.xPt), c = a.map((e) => e.yPt);
				o.fillRect(Math.min(...s), Math.min(...c), Math.max(...s) - Math.min(...s), Math.max(...c) - Math.min(...c));
			}, { railDev: n, gapDev: r, spanDev: i } = ft(a.widthPt * b, t.dpr), s = n / t.dpr;
			if (v) {
				let a = Math.round(p[0].yPt * t.dpr - i / 2), o = Math.min(p[0].xPt, p[1].xPt), c = Math.abs(p[1].xPt - p[0].xPt);
				e(o, a / t.dpr, c, s), e(o, (a + n + r) / t.dpr, c, s);
			} else {
				let a = Math.round(p[0].xPt * t.dpr - i / 2), o = Math.min(p[0].yPt, p[1].yPt), c = Math.abs(p[1].yPt - p[0].yPt);
				e(a / t.dpr, o, s, c), e((a + n + r) / t.dpr, o, s, c);
			}
		} else {
			let { railDev: e, gapDev: n, spanDev: r } = ft(a.widthPt * b, t.dpr), i = e / t.dpr / b, s = n / t.dpr / b, l = r / t.dpr / b;
			if (u) {
				let e = Math.min(c[0].xPt, c[1].xPt), t = Math.abs(c[1].xPt - c[0].xPt);
				o.fillRect(e, c[0].yPt - l / 2, t, i), o.fillRect(e, c[0].yPt - l / 2 + i + s, t, i);
			} else {
				let e = Math.min(c[0].yPt, c[1].yPt), t = Math.abs(c[1].yPt - c[0].yPt);
				o.fillRect(c[0].xPt - l / 2, e, i, t), o.fillRect(c[0].xPt - l / 2 + i + s, e, i, t);
			}
		}
		o.setLineDash([]);
		return;
	}
	let x = ip(f, y && b > 0 ? {
		xPt: s(p[0].xPt, a.widthPt * b, t.dpr),
		yPt: 0
	} : v && b > 0 ? {
		xPt: 0,
		yPt: s(p[0].yPt, a.widthPt * b, t.dpr)
	} : {
		xPt: 0,
		yPt: 0
	}) ?? {
		xPt: 0,
		yPt: 0
	}, S = c[0];
	o.moveTo(S.xPt + x.xPt, S.yPt + x.yPt);
	for (let e of c.slice(1)) o.lineTo(e.xPt + x.xPt, e.yPt + x.yPt);
	let C = a.style === "wavy" && c.length > 2;
	C && (o.save(), o.lineJoin = "bevel"), o.stroke(), C && o.restore(), o.setLineDash([]);
}
//#endregion
//#region packages/docx/src/paint/deferred-paint-frame.ts
function Lp(e, t) {
	return (n) => () => {
		e.save();
		try {
			t(), n();
		} finally {
			e.restore();
		}
	};
}
//#endregion
//#region packages/docx/src/paint/canvas-table.ts
function Rp(e, t) {
	let n = t.pointToCss ?? ep(t.scale);
	if (n.b !== 0 || n.c !== 0) return e;
	let r = [
		{
			xPt: e.xPt,
			yPt: e.yPt
		},
		{
			xPt: e.xPt + e.widthPt,
			yPt: e.yPt
		},
		{
			xPt: e.xPt,
			yPt: e.yPt + e.heightPt
		},
		{
			xPt: e.xPt + e.widthPt,
			yPt: e.yPt + e.heightPt
		}
	].map((e) => np(n, e)), i = r.map((e) => e.xPt), a = r.map((e) => e.yPt), o = Math.floor(Math.min(...i) * t.dpr) / t.dpr, s = Math.floor(Math.min(...a) * t.dpr) / t.dpr, c = Math.ceil(Math.max(...i) * t.dpr) / t.dpr, l = Math.ceil(Math.max(...a) * t.dpr) / t.dpr, u = [
		{
			xPt: o,
			yPt: s
		},
		{
			xPt: c,
			yPt: s
		},
		{
			xPt: o,
			yPt: l
		},
		{
			xPt: c,
			yPt: l
		}
	].map((e) => rp(n, e));
	if (u.some((e) => e === null)) return e;
	let d = u.filter((e) => e !== null), f = d.map((e) => e.xPt), p = d.map((e) => e.yPt);
	return {
		xPt: Math.min(...f),
		yPt: Math.min(...p),
		widthPt: Math.max(...f) - Math.min(...f),
		heightPt: Math.max(...p) - Math.min(...p)
	};
}
function zp(e, t, n, r = !0) {
	let i = t.xPt - e.flowBounds.xPt, a = t.yPt - e.flowBounds.yPt, o = n.layoutTranslationPt ?? {
		xPt: 0,
		yPt: 0
	}, s = $f(n.pointToCss ?? ep(n.scale), tp(i, a)), c = Lp(n.ctx, () => n.ctx.translate(i, a)), l = {
		...n,
		pointToCss: s,
		layoutTranslationPt: {
			xPt: o.xPt + i,
			yPt: o.yPt + a
		}
	};
	c(() => {
		e.kind === "paragraph" ? nm(e, l) : Up(e, l, e.resolvedFloatingTables ?? [], r);
	})();
}
function Bp(e, t) {
	let n = Fp(t);
	for (let r of e.borders) Ip(r, t, n);
}
function Vp(e, t, n) {
	let r = t.xPt - e.flowBounds.xPt, i = t.yPt - e.flowBounds.yPt, a = n.layoutTranslationPt ?? {
		xPt: 0,
		yPt: 0
	}, o = $f(n.pointToCss ?? ep(n.scale), tp(r, i)), s = Lp(n.ctx, () => n.ctx.translate(r, i)), c = {
		...n,
		pointToCss: o,
		layoutTranslationPt: {
			xPt: a.xPt + r,
			yPt: a.yPt + i
		}
	};
	s(() => {
		let t = () => Bp(e, c);
		if (!e.clipBounds) {
			t();
			return;
		}
		Lp(n.ctx, () => {
			n.ctx.beginPath(), n.ctx.rect(e.clipBounds.xPt, e.clipBounds.yPt, e.clipBounds.widthPt, e.clipBounds.heightPt), n.ctx.clip();
		})(t)();
	})();
}
function Hp(e, t, n, r) {
	for (let n of e.rows) for (let e of n.cells) {
		let n = "visualMergeOwnership" in e && e.visualMergeOwnership === "continuation";
		if (e.verticalMerge === "continue" && !n) continue;
		e.background && (t.ctx.fillStyle = e.background.color, t.ctx.fillRect(e.flowBounds.xPt, e.flowBounds.yPt, e.flowBounds.widthPt, e.flowBounds.heightPt));
		let r = (t, n = !0) => {
			for (let r of e.blocks) zp(r.layout, {
				xPt: e.contentBounds.xPt + (r.layout.kind === "table" ? r.layout.flowBounds.xPt : 0),
				yPt: e.flowBounds.yPt + r.offsetPt + (r.layout.kind === "table" ? r.layout.flowBounds.yPt : 0)
			}, t, r.layout.kind !== "table" || n);
		};
		if (!e.clipBounds) {
			r(t);
			continue;
		}
		if (Lp(t.ctx, () => {
			t.ctx.beginPath(), t.ctx.rect(e.clipBounds.xPt, e.clipBounds.yPt, e.clipBounds.widthPt, e.clipBounds.heightPt), t.ctx.clip();
		})(() => r(t, !1))(), e.blocks.some((e) => e.layout.kind === "table")) {
			let n = Rp(e.clipBounds, t);
			Lp(t.ctx, () => {
				t.ctx.beginPath(), t.ctx.rect(n.xPt, n.yPt, n.widthPt, n.heightPt), t.ctx.clip();
			})(() => {
				for (let n of e.blocks) n.layout.kind === "table" && Vp(n.layout, {
					xPt: e.contentBounds.xPt + n.layout.flowBounds.xPt,
					yPt: e.flowBounds.yPt + n.offsetPt + n.layout.flowBounds.yPt
				}, t);
			})();
		}
	}
	Gp(n, t), r && Bp(e, t);
}
function Up(e, t, n, r) {
	if (!e.clipBounds) {
		Hp(e, t, n, r);
		return;
	}
	let i = e.clipBounds;
	Lp(t.ctx, () => {
		t.ctx.beginPath(), t.ctx.rect(i.xPt, i.yPt, i.widthPt, i.heightPt), t.ctx.clip();
	})(() => Hp(e, t, n, r))();
}
function Wp(e, t, n) {
	Up(e, t, n ?? e.resolvedFloatingTables ?? [], !0);
}
function Gp(e, t) {
	let n = t.layoutTranslationPt ?? {
		xPt: 0,
		yPt: 0
	};
	for (let r of e) zp(r.child, {
		xPt: r.xPt - n.xPt,
		yPt: r.yPt - n.yPt
	}, t);
}
//#endregion
//#region packages/docx/src/paint/canvas-transform.ts
function Kp(e, t) {
	let n = e.transform;
	if (n) {
		n.call(e, t.a, t.b, t.c, t.d, t.e, t.f);
		return;
	}
	if (e.translate(t.e, t.f), t.a === 0 && t.b === 1 && t.c === -1 && t.d === 0) e.rotate(Math.PI / 2);
	else if (t.a === 0 && t.b === -1 && t.c === 1 && t.d === 0) e.rotate(-Math.PI / 2);
	else if (t.b === 0 && t.c === 0) e.scale(t.a, t.d);
	else throw Error("Canvas context cannot apply the retained point-space transform");
}
//#endregion
//#region packages/docx/src/paint/canvas-text.ts
function qp(e) {
	if (e.text.length !== e.range.end - e.range.start) throw Error("UTF-16 text range is inconsistent");
	if (e.clusters.length === 0) throw Error("Retained glyph slices are incomplete (clusters)");
	let t = e.range.start;
	for (let n of e.clusters) {
		let { advancePt: r, offset: i, range: a } = n;
		if (!Number.isFinite(r) || !Number.isFinite(i.xPt) || !Number.isFinite(i.yPt) || a.start !== t || a.end <= a.start || a.end > e.range.end) throw Error(`Retained glyph slices are incomplete (cluster range ${t}:${a.start}-${a.end}/${e.range.end}; advance ${r}; offset ${i.xPt},${i.yPt})`);
		t = a.end;
	}
	if (t !== e.range.end) throw Error(`Retained glyph slices are incomplete (cluster end ${t}/${e.range.end})`);
	if (e.paintOps.length === 0) throw Error("Retained glyph slices are incomplete (paint ops)");
	let n = e.range.start;
	for (let t of e.paintOps) {
		let r = t.sourceMapping !== "kashida" && t.text.length !== t.range.end - t.range.start, i = !Number.isFinite(t.offset.xPt) || !Number.isFinite(t.offset.yPt) || t.glyphOffsetPt !== void 0 && (!Number.isFinite(t.glyphOffsetPt.xPt) || !Number.isFinite(t.glyphOffsetPt.yPt)) || t.blockAxisInkBounds !== void 0 && (!Number.isFinite(t.blockAxisInkBounds.startPt) || !Number.isFinite(t.blockAxisInkBounds.endPt) || t.blockAxisInkBounds.endPt < t.blockAxisInkBounds.startPt) || !Number.isFinite(t.letterSpacingPt) || !Number.isFinite(t.scaleX) || t.scaleX <= 0 || t.scaleY !== void 0 && (!Number.isFinite(t.scaleY) || t.scaleY <= 0), a = t.range.start !== n || t.range.end <= t.range.start || t.range.end > e.range.end;
		if (r || i || a) throw Error(`Retained glyph slices are incomplete (${r ? "text" : i ? "geometry" : `range ${n}:${t.range.start}-${t.range.end}/${e.range.end}`})`);
		n = t.range.end;
	}
	let r = e.text.slice(n - e.range.start);
	if (r !== "" && !/^\s+$/u.test(r)) throw Error(`Retained glyph slices are incomplete (paint end ${n}/${e.range.end})`);
}
function Jp(e, t) {
	return e.kind === "explicit" ? e.color : e.kind === "auto" ? se(e.background ?? "#FFFFFF") : t.defaultTextColor ?? "#000000";
}
function Yp(e, t) {
	return Jp(e.color, t);
}
function Xp(e, t, n = !1) {
	let { ctx: r } = t;
	r.fillStyle = Jp(e.color, t), r.font = at(e.fontRoute, e.fontSizePt, e.fontWeight, e.fontStyle), n ? (r.save(), r.translate(e.origin.xPt, e.origin.yPt), r.rotate(-Math.PI / 2), r.fillText(e.text, 0, 0), r.restore()) : r.fillText(e.text, e.origin.xPt, e.origin.yPt);
}
function Zp(e, t) {
	let { ctx: n } = t;
	if (n.beginPath(), e.points.length > 0) {
		let t = e.points[0];
		n.moveTo(t.xPt, t.yPt);
		for (let t of e.points.slice(1)) n.lineTo(t.xPt, t.yPt);
	}
	e.stroke !== null && (n.strokeStyle = e.stroke, n.lineWidth = e.strokeWidthPt, n.stroke()), e.fill !== null && (n.fillStyle = e.fill, n.fill());
}
function Qp(e, t) {
	let n = new Map(e.textBoxes.map((e) => [e.id, e]));
	return (t.textBoxIds ?? []).flatMap((e) => {
		let t = n.get(e);
		return t ? [t] : [];
	});
}
function $p(e, t, n) {
	let r = n.layoutTranslationPt, i = e.anchorLayer?.horizontalOwnership === "page" ? -(r?.xPt ?? 0) : 0, a = e.anchorLayer?.verticalOwnership === "page" ? -(r?.yPt ?? 0) : 0;
	(i !== 0 || a !== 0) && (n.ctx.save(), n.ctx.translate(i, a));
	let o = (n) => {
		Pp(e, n);
		for (let e of t) rm(e, {
			...n,
			omitAnchoredDrawings: !1
		});
	};
	try {
		if (e.orientation === "upright-physical") {
			if (!e.transform) throw Error("Upright physical drawing requires its retained logical transform");
			let t = $f(n.pointToCss ?? ep(n.scale), e.transform);
			Lp(n.ctx, () => {
				Kp(n.ctx, e.transform);
			})(() => o({
				...n,
				pointToCss: t
			}))();
		} else o(n);
	} finally {
		(i !== 0 || a !== 0) && n.ctx.restore();
	}
}
function em(e, t, n) {
	$p(t, Qp(e, t), n);
}
function tm(e, t) {
	let { ctx: n } = t, r = new Set(e.drawings.flatMap((e) => e.textBoxIds ?? [])), i = (n) => em(e, n, t), a = e.drawings.filter((e) => e.anchorLayer?.behindDoc === !0).sort((e, t) => e.anchorLayer.relativeHeight - t.anchorLayer.relativeHeight || e.anchorLayer.sourceOrder - t.anchorLayer.sourceOrder);
	if (!t.omitAnchoredDrawings) for (let e of a) i(e);
	for (let t of e.lineNumbers ?? []) for (let e of t.paintOps) n.fillStyle = e.color, n.font = e.font, n.textAlign = e.textAlign, n.textBaseline = "alphabetic", n.fillText(e.text, e.origin.xPt, e.origin.yPt);
	e.shading && (n.fillStyle = e.shading.color, n.fillRect(e.inkBounds.xPt, e.inkBounds.yPt, e.inkBounds.widthPt, e.inkBounds.heightPt));
	for (let r of e.lines) for (let e of r.placements) {
		if (e.kind === "resource") {
			if (!t.resources) throw Error(`Missing retained resource painter for ${e.resourceKey}`);
			if (t.textBoxVerticalMode) {
				let r = t.textBoxVerticalMode === "vert270" ? Math.PI / 2 : -Math.PI / 2;
				n.save(), n.translate(e.bounds.xPt + e.bounds.widthPt / 2, e.bounds.yPt + e.bounds.heightPt / 2), n.rotate(r), Np(e.resourceKey, e.resourceKind, {
					xPt: -e.bounds.heightPt / 2,
					yPt: -e.bounds.widthPt / 2,
					widthPt: e.bounds.heightPt,
					heightPt: e.bounds.widthPt
				}, e.orientation, t), n.restore();
			} else Np(e.resourceKey, e.resourceKind, e.bounds, e.orientation, t);
			continue;
		}
		if (e.kind === "tab") {
			if (e.leader !== "none") {
				if (!e.leaderGlyphs) throw Error("Retained tab leader geometry is missing");
				for (let n of e.leaderGlyphs) Xp(n, t);
			}
			continue;
		}
		if (e.kind !== "text") continue;
		if (qp(e), e.unsupportedGeometry?.length) throw Error(`Unsupported retained typography geometry: ${e.unsupportedGeometry.join(", ")}`);
		if (e.highlightFragments) for (let t of e.highlightFragments) n.fillStyle = t.color, n.fillRect(t.rect.xPt, t.rect.yPt, t.rect.widthPt, t.rect.heightPt);
		else (e.background || e.highlight) && (n.fillStyle = e.highlight ?? e.background ?? "#000000", n.fillRect(e.bounds.xPt, e.bounds.yPt, e.bounds.widthPt, e.bounds.heightPt));
		n.fillStyle = Yp(e, t), n.font = at(e.fontRoute, e.fontSizePt, e.fontWeight, e.fontStyle), n.textAlign = "left", n.textBaseline = "alphabetic";
		let r = n.letterSpacing, i = n.fontKerning;
		for (let t of e.paintOps) {
			n.direction = t.direction, n.fontKerning = t.kerning;
			let r = e.origin.xPt + t.offset.xPt, i = e.origin.yPt + t.offset.yPt, a = t.glyphOffsetPt?.xPt ?? 0, o = t.glyphOffsetPt?.yPt ?? 0;
			if (t.glyphOrientation === "upright") {
				n.save(), n.translate(r, i), n.rotate(-Math.PI / 2), (t.scaleX !== 1 || t.scaleY !== void 0) && (t.writingMode === "vertical-rl" ? n.scale(1, t.scaleX) : n.scale(t.scaleX, t.scaleY ?? 1)), n.textAlign = "center", n.textBaseline = "middle", n.letterSpacing = `${t.letterSpacingPt}px`;
				let e = () => n.fillText(t.text, a, o);
				t.verticalFeature ? Ne(n, e) : e(), n.restore();
			} else t.glyphOrientation === "rotate" ? (n.save(), n.translate(r, i), t.scaleX !== 1 && n.scale(t.scaleX, 1), n.textAlign = "center", n.textBaseline = "middle", n.letterSpacing = `${t.letterSpacingPt / t.scaleX}px`, n.fillText(t.text, a, o), n.restore()) : t.scaleX === 1 ? (n.letterSpacing = `${t.letterSpacingPt}px`, n.fillText(t.text, r + a, i + o)) : (n.save(), n.translate(r + a, i + o), n.scale(t.scaleX, 1), n.letterSpacing = `${t.letterSpacingPt / t.scaleX}px`, n.fillText(t.text, 0, 0), n.restore());
		}
		if (n.letterSpacing = r, n.fontKerning = i, e.ruby) {
			let n = t.textBoxVerticalMode === "eaVert" || t.textBoxVerticalMode === "mongolianVert";
			for (let r of e.ruby.paintOps) Xp(r, t, n);
		}
		for (let n of e.emphasis?.glyphs ?? []) Xp(n, t);
		for (let n of e.emphasis?.paths ?? []) Zp(n, t);
		for (let n of e.decorations) Ip(n, t);
		for (let n of e.runBorderFragments ?? []) Ip(n, t);
	}
	let o = Fp(t);
	for (let n of e.borders) Ip(n, t, o);
	for (let t of e.drawings.filter((e) => !e.anchorLayer)) i(t);
	let s = e.drawings.filter((e) => e.anchorLayer && !e.anchorLayer.behindDoc).sort((e, t) => e.anchorLayer.relativeHeight - t.anchorLayer.relativeHeight || e.anchorLayer.sourceOrder - t.anchorLayer.sourceOrder);
	if (!t.omitAnchoredDrawings) for (let e of s) i(e);
	for (let n of e.textBoxes) r.has(n.id) || rm(n, {
		...t,
		omitAnchoredDrawings: !1
	});
}
function nm(e, t) {
	if (!e.clipBounds) {
		tm(e, t);
		return;
	}
	let n = e.clipBounds;
	Lp(t.ctx, () => {
		t.ctx.beginPath(), t.ctx.rect(n.xPt, n.yPt, n.widthPt, n.heightPt), t.ctx.clip();
	})(() => tm(e, t))();
}
function rm(e, t) {
	let n = (t) => {
		for (let n of e.story.blocks) if (n.kind === "paragraph") nm(n, t);
		else if (n.kind === "table") Wp(n, t, n.resolvedFloatingTables ?? []);
		else throw Error(`Text-box story contains unsupported retained node: ${n.kind}`);
	}, r = $f(t.pointToCss ?? ep(t.scale), e.transform), i = e.transform.a !== 1 || e.transform.b !== 0 || e.transform.c !== 0 || e.transform.d !== 1 || e.transform.e !== 0 || e.transform.f !== 0, a = Lp(t.ctx, () => {
		i && (e.verticalMode ? (t.ctx.translate(e.transform.e, e.transform.f), t.ctx.rotate(e.verticalMode === "vert270" ? -Math.PI / 2 : Math.PI / 2)) : t.ctx.transform(e.transform.a, e.transform.b, e.transform.c, e.transform.d, e.transform.e, e.transform.f));
	}), o = e.clipBounds ? Lp(t.ctx, () => {
		t.ctx.beginPath(), t.ctx.rect(e.clipBounds.xPt, e.clipBounds.yPt, e.clipBounds.widthPt, e.clipBounds.heightPt), t.ctx.clip();
	}) : null, s = t.documentDefaultTextColor ?? t.defaultTextColor ?? "#000000", c = {
		...t,
		pointToCss: r,
		documentDefaultTextColor: s,
		defaultTextColor: e.defaultTextColor ?? s,
		...e.verticalMode ? { textBoxVerticalMode: e.verticalMode } : {}
	};
	a(() => {
		o ? o(() => n(c))() : n(c);
	})();
}
//#endregion
//#region packages/docx/src/paint/page-border.ts
function im(e, t) {
	let n = $f(t.pointToCss ?? ep(t.scale), e.logicalToPhysical), r = {
		...t,
		pointToCss: n
	};
	Lp(t.ctx, () => {
		Kp(t.ctx, e.logicalToPhysical);
	})(() => {
		for (let t of e.segments) Ip(t, r, .5);
	})();
}
//#endregion
//#region packages/docx/src/paint/canvas-page.ts
var am = Object.freeze({ paint(e, t) {
	throw Error(`Missing retained resource painter for ${e}: expected ${t}`);
} });
function om(e, t) {
	return Object.freeze({ paint(n, r, i, a) {
		switch (r) {
			case "image":
				t.image(e.resolve(n, r), i, a);
				return;
			case "chart":
				t.chart(e.resolve(n, r), i, a);
				return;
			case "math":
				t.math(e.resolve(n, r), i, a);
				return;
			case "picture-bullet":
				t["picture-bullet"](e.resolve(n, r), i, a);
				return;
			default: throw Error(`Unknown retained resource kind: ${String(r)}`);
		}
	} });
}
function sm(e, t) {
	switch (e.kind) {
		case "drawing":
			Pp(e, t);
			return;
		case "paragraph":
			nm(e, t);
			return;
		case "table":
			Wp(e, t, e.resolvedFloatingTables ?? []);
			return;
		case "note": {
			e.separator.forEach((e) => Ip(e, t));
			let n = () => e.story.blocks.forEach((e) => sm(e, t));
			if (!e.story.clipBounds) {
				n();
				return;
			}
			let r = e.story.clipBounds;
			t.ctx.save();
			try {
				t.ctx.beginPath(), t.ctx.rect(r.xPt, r.yPt, r.widthPt, r.heightPt), t.ctx.clip(), n();
			} finally {
				t.ctx.restore();
			}
			return;
		}
		case "textbox": throw Error(`Unsupported page paint node kind: ${e.kind}`);
		default: throw Error(`Unknown page paint node kind: ${String(e)}`);
	}
}
function cm(e, t) {
	let n = e.columnSeparators;
	if (n.length === 0) return;
	let { ctx: r } = t;
	r.save(), r.strokeStyle = "#000000";
	for (let e of n) {
		let n = Mp(e, t.scale, t.dpr);
		r.lineWidth = n.widthPt, r.beginPath(), r.moveTo(n.segment.start.xPt, n.segment.start.yPt), r.lineTo(n.segment.end.xPt, n.segment.end.yPt), r.stroke();
	}
	r.restore();
}
function lm(e, t, n, r) {
	let i = n.get(e.flowDomainId), a = e.coordinateSpace === "upright-physical" ? void 0 : i?.coordinateSpace.logicalToPhysical, o = Lp(t.ctx, () => {
		a && (a.a !== 1 || a.b !== 0 || a.c !== 0 || a.d !== 1 || a.e !== 0 || a.f !== 0) && Kp(t.ctx, a);
	}), s = {
		...t,
		...a ? { pointToCss: {
			a: a.a * t.scale,
			b: a.b * t.scale,
			c: a.c * t.scale,
			d: a.d * t.scale,
			e: a.e * t.scale,
			f: a.f * t.scale
		} } : {}
	};
	o(() => r(s))();
}
function um(e, t) {
	if (e.kind === "transform") {
		let n = t.transform;
		if (n) n.call(t, e.transform.a, e.transform.b, e.transform.c, e.transform.d, e.transform.e, e.transform.f);
		else if (e.transform.a === 1 && e.transform.b === 0 && e.transform.c === 0 && e.transform.d === 1) t.translate(e.transform.e, e.transform.f);
		else throw Error("Canvas context cannot apply the retained page paint transform");
		return;
	}
	t.beginPath(), t.rect(e.clip.xPt, e.clip.yPt, e.clip.widthPt, e.clip.heightPt), t.clip();
}
function dm(e, t) {
	let n = t.pointToCss ?? ep(t.scale);
	for (let t of e.frames) t.kind === "transform" && (n = $f(n, t.transform));
	let r = {
		...t,
		pointToCss: n,
		layoutTranslationPt: e.layoutTranslationPt,
		omitAnchoredDrawings: !1
	}, i = 0;
	try {
		for (let n of e.frames) t.ctx.save(), i += 1, um(n, t.ctx);
		$p(e.node, e.textBoxes, r);
	} finally {
		for (; i > 0;) t.ctx.restore(), --i;
	}
}
function fm(e, t) {
	let n = new Map(e.sectionRegions.flatMap((e) => e.flowDomainIds.map((t) => [t, e]))), r = new Map(e.sectionRegions.map((e) => [e.id, e]));
	for (let t of e.flowDomains) if (t.kind === "footnote" || t.kind === "endnote") {
		let i = t.sectionRegionId ? r.get(t.sectionRegionId) : e.sectionRegions[0];
		if (!i) throw Error(`${t.id} references missing page story region ${t.sectionRegionId ?? "<default>"}`);
		n.set(t.id, i);
	}
	let i = e.layers.paintOrder, a = i.findIndex((e) => e.sourceLayer !== "background" && e.sourceLayer !== "behindText" && e.sourceLayer !== "header"), o = a === -1 ? i.length : a, s = (e) => {
		for (let r of e) lm(r, t, n, (e) => {
			r.kind === "drawing" ? dm(r, e) : sm(r.node, {
				...e,
				omitAnchoredDrawings: r.omitAnchoredDrawings
			});
		});
	};
	e.pageBorder?.zOrder === "back" && im(e.pageBorder, t), s(i.slice(0, o)), cm(e, t), s(i.slice(o)), e.pageBorder?.zOrder !== "back" && e.pageBorder && im(e.pageBorder, t);
}
async function pm(e, t, n, r, i = am) {
	let a = e.pages[t];
	if (!a) throw RangeError(`Page ${t} is outside the layout`);
	let o = n.getContext("2d");
	if (!o) throw Error("Canvas 2D context is unavailable");
	let s = r.scale * r.dpr;
	n.width = Math.ceil(a.geometry.widthPt * s), n.height = Math.ceil(a.geometry.heightPt * s), o.save();
	try {
		o.setTransform(1, 0, 0, 1, 0, 0), o.clearRect(0, 0, n.width, n.height), o.setTransform(s, 0, 0, s, 0, 0), fm(a, {
			ctx: o,
			scale: r.scale,
			dpr: r.dpr,
			resources: i
		});
	} finally {
		o.restore();
	}
}
//#endregion
//#region packages/docx/src/paint/resource-session.ts
function mm(e, t) {
	if (typeof e != "string" || e.trim().length === 0) throw TypeError(`${t} must be a non-empty string`);
}
function hm(e) {
	return mm(e, "unavailable paint resource reason"), Object.freeze({
		status: "unavailable",
		reason: e
	});
}
function gm(e) {
	return typeof e == "object" && !!e && e.status === "unavailable" && typeof e.reason == "string" && e.reason.trim().length > 0;
}
function _m(e) {
	typeof e != "object" || !e || e.status !== "unavailable" || mm(e.reason, "unavailable paint resource reason");
}
function vm(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of t) {
		if (n.has(r.resourceKey)) throw Error(`Duplicate paint resource handle: ${r.resourceKey}`);
		_m(r.handle), e.resolve(r.resourceKey, r.kind), n.set(r.resourceKey, Object.freeze({
			kind: r.kind,
			handle: r.handle
		}));
	}
	let r = Object.freeze([...n.keys()].sort());
	return Object.freeze({
		keys: r,
		resolve(t, r) {
			let i = e.resolve(t, r), a = n.get(t);
			if (!a) throw Error(`Missing paint resource handle for ${t}: expected ${r}`);
			if (a.kind !== r) throw Error(`Paint resource kind mismatch for ${t}: expected ${r}, got ${a.kind}`);
			return Object.freeze({
				descriptor: i,
				handle: a.handle
			});
		}
	});
}
function ym(e, t) {
	return vm(e, e.descriptors.map((e) => {
		if (e.kind === "chart") return {
			resourceKey: e.resourceKey,
			kind: e.kind,
			handle: null
		};
		let n = t(e);
		if (n == null) throw Error(`Missing ${e.kind} paint handle for ${e.resourceKey}`);
		return {
			resourceKey: e.resourceKey,
			kind: e.kind,
			handle: n
		};
	}));
}
//#endregion
//#region packages/docx/src/paint/canonical-resource-handlers.ts
function bm(e) {
	if (!gm(e.handle)) {
		if (e.handle === void 0 || e.handle === null) throw Error(`Missing ${e.descriptor.kind} drawable for ${e.descriptor.resourceKey}`);
		return e.handle;
	}
}
function xm(e, t, n) {
	let r = e.descriptor, i = bm(e);
	if (!i) return;
	let a = (e, a) => {
		le(n, i, r.srcRect, e, a, t.widthPt, t.heightPt);
	}, o = r.alpha !== void 0 && r.alpha < 1;
	o && (n.save(), n.globalAlpha *= r.alpha);
	let s = r.rotation ?? 0;
	s === 0 && !r.flipH && !r.flipV ? a(t.xPt, t.yPt) : (n.save(), n.translate(t.xPt + t.widthPt / 2, t.yPt + t.heightPt / 2), n.rotate(s * Math.PI / 180), n.scale(r.flipH ? -1 : 1, r.flipV ? -1 : 1), a(-t.widthPt / 2, -t.heightPt / 2), n.restore()), o && n.restore();
}
function Sm(e, t, n) {
	let r = bm(e);
	r && n.drawImage(r, t.xPt, t.yPt, t.widthPt, t.heightPt);
}
var Cm = Object.freeze({
	image(e, t, n) {
		xm(e, t, n);
	},
	chart(e, t, n) {
		Pe(n, e.descriptor.model, {
			x: t.xPt,
			y: t.yPt,
			w: t.widthPt,
			h: t.heightPt
		}, 1);
	},
	math(e, t, n) {
		Sm(e, t, n);
	},
	"picture-bullet"(e, t, n) {
		Sm(e, t, n);
	}
}), wm = /* @__PURE__ */ new WeakMap();
function Tm(e, t) {
	return (t ?? e.geometry.widthPt * 1.3333333333333333) / e.geometry.widthPt;
}
function Em(e) {
	if (Ee(e)) return e.ownerDocument ?? (typeof document > "u" ? null : document);
	let t = e.ownerDocument, n = t?.defaultView?.HTMLCanvasElement;
	return n && e instanceof n ? t : null;
}
function Dm(e) {
	return Em(e) !== null;
}
function Om(e, t) {
	let n = Em(e);
	if (!t || n && e.isConnected) return { canvas: e };
	let r = n ?? (typeof document > "u" ? void 0 : document);
	if (!r) throw Error("OpenType vertical glyph paint requires an element-backed document surface");
	let i = r.body ?? r.documentElement;
	if (!i) throw Error("OpenType vertical glyph paint requires an attached document surface");
	let a = r.createElement("canvas");
	return a.setAttribute("aria-hidden", "true"), Object.assign(a.style, {
		position: "fixed",
		left: "-99999px",
		top: "0",
		opacity: "0",
		pointerEvents: "none"
	}), i.appendChild(a), {
		canvas: a,
		release: () => a.remove()
	};
}
async function km(e, t, n, r) {
	let i = r.fetchImage ? Oe(r.fetchImage) : void 0, a;
	try {
		let i = (wm.get(n) ?? 0) + 1;
		wm.set(n, i);
		let o = () => wm.get(n) !== i, s = r.dpr ?? h(), c = Om(n, !r.parseError && t.layers.capabilities.requiresElementBackedVerticalGlyphPaint), l = c.canvas;
		a = c.release;
		let u = l.getContext("2d");
		if (!u) throw Error("2D canvas is unavailable for DOCX paint");
		let d = Tm(t, r.width), f = t.geometry.widthPt * d, p = t.geometry.heightPt * d, m = ee(f * s, p * s), g = m.clamped ? s * m.scale : s;
		if (n.width = m.width, n.height = m.height, l !== n && (l.width = m.width, l.height = m.height), Dm(n) && (n.style.width = `${f}px`, n.style.height = `${p}px`, n.style.display || (n.style.display = "block")), Dm(l) && l !== n && (l.style.width = `${f}px`, l.style.height = `${p}px`), u.scale(g, g), u.fillStyle = "#ffffff", u.fillRect(0, 0, f, p), r.parseError) {
			await pm(e, 0, n, {
				scale: d,
				dpr: g
			});
			return;
		}
		let _;
		try {
			_ = await kp(r.registry.descriptors, r.fetchImage);
		} catch (e) {
			if (o()) return;
			throw e;
		}
		if (o()) return;
		let v = om(ym(r.registry, (e) => {
			if (e.kind === "math") return r.privateResources?.keys.includes(e.resourceKey) ? r.privateResources.resolve(e.resourceKey) : hm("optional math renderer unavailable");
			if (e.kind === "image" || e.kind === "picture-bullet") return _.get(Sp(e.partPath, e.colorReplaceFrom, e.duotone)) ?? hm(r.fetchImage ? "unsupported image format produced no drawable output" : "image byte source unavailable");
		}), Cm);
		u.save();
		try {
			u.scale(d, d), fm(t, {
				ctx: u,
				scale: d,
				dpr: g,
				resources: v,
				documentDefaultTextColor: r.defaultTextColor ?? "#000000",
				defaultTextColor: r.defaultTextColor ?? "#000000",
				showTrackChanges: r.showTrackChanges ?? !0
			});
		} finally {
			u.restore();
		}
		if (l !== n) {
			if (o()) return;
			let e = n.getContext("2d");
			if (!e) throw Error("2D canvas is unavailable for DOCX paint projection");
			e.drawImage(l, 0, 0);
		}
		if (r.onTextRun) for (let e of r.textRuns) r.onTextRun(e);
	} finally {
		a?.(), i?.();
	}
}
//#endregion
//#region packages/docx/src/layout/body-layout-kernel.ts
var Am = class extends Error {
	code = "NOTE_CAPACITY_EXCEEDED";
	constructor(e, t, n) {
		super(`${e} story exceeds ${n} on page ${t}`), this.kind = e, this.pageIndex = t, this.containerId = n, this.name = "NoteCapacityExceededError";
	}
};
//#endregion
//#region packages/docx/src/layout/body-pagination.ts
function jm(e) {
	return Object.freeze({
		...e,
		pages: Object.freeze([...e.pages])
	});
}
function Mm(e) {
	let { kind: t, region: n, ...r } = e, i = lf(r);
	if (n && (i = uf(i, n)), t === "content" && i.sectionRegions.length === 0) throw RangeError("A content page draft requires an initial section region");
	if (t === "parity-blank" && i.sectionRegions.length !== 0) throw RangeError("A parity blank cannot retain a section region");
	return Object.freeze({
		kind: t,
		accumulator: i
	});
}
function Nm(e, t) {
	if (t.kind !== "content" || t.accumulator.pageIndex !== e.pageIndex) throw Error("The initial body page must be owned by the active flow");
	return jm({
		flow: e,
		pages: [t],
		footnoteReservePt: 0,
		balanceTargetPt: null
	});
}
function Pm(e, t) {
	if (t !== null && (!Number.isFinite(t) || t < 0)) throw RangeError("A body balance target must be finite and non-negative");
	return jm({
		...e,
		balanceTargetPt: t
	});
}
function Fm(e, t) {
	if (!Number.isFinite(t) || t < 0) throw RangeError("A footnote reserve increment must be finite and non-negative");
	return t === 0 ? e : jm({
		...e,
		footnoteReservePt: e.footnoteReservePt + t
	});
}
function Im(e, t, n) {
	let r = [...e.pages], i = t.state, a = !1;
	for (let e of t.events) {
		if (e.type === "place") throw Error("Occurrence acceptance owns place events");
		if (e.type !== "next-column") {
			if (e.type === "next-page") {
				if (e.parityBlank) r.push(n.openParityBlankPage(e));
				else {
					let a = n.openContentPage(e, t.state);
					r.push(a.page), i = a.flow;
				}
				a = !0;
				continue;
			}
			if (!a) {
				let t = r.at(-1);
				if (!t || t.kind !== "content") throw Error("A continuous section requires an active content page");
				r[r.length - 1] = n.openSamePageSectionRegion(t, e, i);
			}
		}
	}
	let o = r.at(-1);
	if (!o || o.kind !== "content" || o.accumulator.pageIndex !== i.pageIndex) throw Error("A page transition must end on the active content page");
	return jm({
		...e,
		flow: i,
		pages: r,
		footnoteReservePt: a ? 0 : e.footnoteReservePt,
		balanceTargetPt: a ? null : e.balanceTargetPt
	});
}
//#endregion
//#region packages/docx/src/layout/retained-geometry-translation.ts
function Lm(e) {
	if (e.length === 0) return null;
	let t = Math.min(...e.map((e) => e.xPt)), n = Math.min(...e.map((e) => e.yPt)), r = Math.max(...e.map((e) => e.xPt + e.widthPt)), i = Math.max(...e.map((e) => e.yPt + e.heightPt));
	return {
		xPt: t,
		yPt: n,
		widthPt: r - t,
		heightPt: i - n
	};
}
function Rm(e) {
	return {
		x: !e.horzSpecified || e.horzAnchor !== "page" && e.horzAnchor !== "margin",
		y: e.vertAnchor !== "page" && e.vertAnchor !== "margin"
	};
}
function zm(e, t) {
	return {
		...e,
		xPt: e.xPt + t.xPt,
		yPt: e.yPt + t.yPt
	};
}
function Z(e, t) {
	return {
		...e,
		xPt: e.xPt + t.xPt,
		yPt: e.yPt + t.yPt
	};
}
function Bm(e, t) {
	return {
		...e,
		from: zm(e.from, t),
		to: zm(e.to, t)
	};
}
function Vm(e, t) {
	return e.kind === "rect" ? {
		...e,
		rect: Z(e.rect, t)
	} : {
		...e,
		points: e.points.map((e) => zm(e, t))
	};
}
function Hm(e, t) {
	return e.kind === "noop" ? e : e.kind === "drawingml-shape" ? {
		...e,
		plan: {
			...e.plan,
			rect: {
				...e.plan.rect,
				x: e.plan.rect.x + t.xPt,
				y: e.plan.rect.y + t.yPt
			}
		}
	} : {
		...e,
		rect: Z(e.rect, t)
	};
}
function Um(e, t) {
	let n = e.orientation === "upright-physical" ? {
		xPt: 0,
		yPt: 0
	} : t;
	return {
		...e,
		flowBounds: Z(e.flowBounds, t),
		inkBounds: Z(e.inkBounds, t),
		...e.clipBounds ? { clipBounds: Z(e.clipBounds, t) } : {},
		...e.transform ? { transform: {
			...e.transform,
			e: e.transform.e + t.xPt,
			f: e.transform.f + t.yPt
		} } : {},
		...e.clip ? { clip: Vm(e.clip, t) } : {},
		commands: e.commands.map((e) => Hm(e, n))
	};
}
function Wm(e, t, n) {
	let r = `${t.xPt}\u0000${t.yPt}`, i = n.drawingMemo.get(e);
	if (i) {
		if (i.key !== r) throw Error("incompatible projection ownership");
		return i.value;
	}
	let a = Um(e, t);
	return n.drawingMemo.set(e, {
		key: r,
		value: a
	}), a;
}
function Gm(e, t, n) {
	return e.kind === "text" ? {
		...e,
		origin: zm(e.origin, t),
		bounds: Z(e.bounds, t),
		decorations: e.decorations.map((e) => ({
			...e,
			from: zm(e.from, t),
			to: zm(e.to, t),
			...e.path ? { path: e.path.map((e) => zm(e, t)) } : {}
		})),
		...e.highlightFragments ? { highlightFragments: e.highlightFragments.map((e) => ({
			...e,
			rect: Z(e.rect, t)
		})) } : {},
		...e.ruby ? { ruby: {
			...e.ruby,
			paintOps: e.ruby.paintOps.map((e) => ({
				...e,
				origin: zm(e.origin, t)
			}))
		} } : {},
		...e.emphasis ? { emphasis: {
			...e.emphasis,
			...e.emphasis.glyphs ? { glyphs: e.emphasis.glyphs.map((e) => ({
				...e,
				origin: zm(e.origin, t)
			})) } : {},
			...e.emphasis.paths ? { paths: e.emphasis.paths.map((e) => ({
				...e,
				points: e.points.map((e) => zm(e, t))
			})) } : {}
		} } : {},
		...e.runBorderFragments ? { runBorderFragments: e.runBorderFragments.map((e) => Bm(e, t)) } : {}
	} : e.kind === "anchor-host" ? {
		...e,
		bounds: Z(e.bounds, t),
		baselinePt: e.baselinePt + t.yPt
	} : e.kind === "drawing" ? {
		...e,
		bounds: Z(e.bounds, n?.get(e.drawingId) ?? t)
	} : e.kind === "tab" && e.leaderGlyphs ? {
		...e,
		...e.bounds ? { bounds: Z(e.bounds, t) } : {},
		leaderGlyphs: e.leaderGlyphs.map((e) => ({
			...e,
			origin: zm(e.origin, t)
		}))
	} : e.bounds ? {
		...e,
		bounds: Z(e.bounds, t)
	} : e;
}
function Km(e, t, n) {
	return {
		...e,
		bounds: Z(e.bounds, t),
		baselinePt: e.baselinePt + t.yPt,
		placements: e.placements.map((e) => Gm(e, t, n))
	};
}
function qm(e, t) {
	let n = e.axes[t];
	return n.status === "resolved" && [
		"page",
		"margin",
		"leftMargin",
		"rightMargin",
		"topMargin",
		"bottomMargin"
	].includes(n.referenceFrame);
}
function Jm(e, t) {
	let n = qm(e, "horizontal") ? 0 : t.xPt, r = qm(e, "vertical") ? 0 : t.yPt, i = {
		xPt: n,
		yPt: r
	}, a = {
		horizontal: e.axes.horizontal.status === "resolved" ? {
			...e.axes.horizontal,
			baseStartPt: e.axes.horizontal.baseStartPt + n,
			baseEndPt: e.axes.horizontal.baseEndPt + n,
			resolvedOriginPt: e.axes.horizontal.resolvedOriginPt + n
		} : e.axes.horizontal,
		vertical: e.axes.vertical.status === "resolved" ? {
			...e.axes.vertical,
			baseStartPt: e.axes.vertical.baseStartPt + r,
			baseEndPt: e.axes.vertical.baseEndPt + r,
			resolvedOriginPt: e.axes.vertical.resolvedOriginPt + r
		} : e.axes.vertical
	};
	return e.status === "unsupported" ? {
		...e,
		axes: a
	} : {
		...e,
		axes: a,
		geometry: {
			...e.geometry,
			objectFrame: Z(e.geometry.objectFrame, i),
			inkBounds: Z(e.geometry.inkBounds, i),
			wrapBounds: e.geometry.wrapBounds ? Z(e.geometry.wrapBounds, i) : null,
			wrap: {
				...e.geometry.wrap,
				polygon: e.geometry.wrap.polygon ? {
					...e.geometry.wrap.polygon,
					points: e.geometry.wrap.polygon.points.map((e) => zm(e, i))
				} : null
			}
		}
	};
}
function Ym(e, t) {
	return Xm(e, t, {
		memo: /* @__PURE__ */ new WeakMap(),
		drawingMemo: /* @__PURE__ */ new WeakMap()
	});
}
function Xm(e, t, n) {
	let r = `${t.xPt}\u0000${t.yPt}`, i = n.memo.get(e);
	if (i) {
		if (i.key !== r) throw Error("incompatible projection ownership");
		return i.value;
	}
	let a = new Map(e.drawings.flatMap((e) => e.anchorLayer ? [[e.anchorLayer.occurrenceId, e.anchorLayer]] : [])), o = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map();
	for (let n of e.drawings) {
		let e = {
			xPt: n.anchorLayer?.horizontalOwnership === "page" ? 0 : t.xPt,
			yPt: n.anchorLayer?.verticalOwnership === "page" ? 0 : t.yPt
		};
		s.set(n.id, e), n.textBoxIds?.forEach((t) => o.set(t, n.orientation === "upright-physical" ? {
			xPt: 0,
			yPt: 0
		} : e));
	}
	let c = e.drawings.map((e) => Wm(e, s.get(e.id) ?? t, n)), l = Lm(c.filter((e) => e.anchorLayer?.cellContainment === !0).map((e) => e.flowBounds)), u = {
		...e,
		flowBounds: Z(e.flowBounds, t),
		inkBounds: Z(e.inkBounds, t),
		...e.clipBounds ? { clipBounds: Z(e.clipBounds, t) } : {},
		lines: e.lines.map((e) => Km(e, t, s)),
		borders: e.borders.map((e) => Bm(e, t)),
		drawings: c,
		...l ? { cellContainmentBounds: l } : {},
		textBoxes: e.textBoxes.map((e) => Qm(e, o.get(e.id) ?? t, n)),
		exclusions: e.exclusions.map((e) => {
			let n = e.anchorOccurrenceId ? a.get(e.anchorOccurrenceId) : void 0, r = {
				xPt: n?.horizontalOwnership === "page" ? 0 : t.xPt,
				yPt: e.verticalOwnership === "page" || n?.verticalOwnership === "page" ? 0 : t.yPt
			};
			return {
				...e,
				bounds: Z(e.bounds, r),
				polygon: e.polygon.map((e) => zm(e, r))
			};
		}),
		...e.anchorCollisions ? { anchorCollisions: e.anchorCollisions.map((e) => ({
			...e,
			bounds: Z(e.bounds, {
				xPt: e.horizontalOwnership === "page" ? 0 : t.xPt,
				yPt: e.verticalOwnership === "page" ? 0 : t.yPt
			})
		})) } : {},
		...e.anchorFrames ? { anchorFrames: e.anchorFrames.map((e) => Jm(e, t)) } : {},
		...e.paragraphMark ? { paragraphMark: {
			...e.paragraphMark,
			bounds: Z(e.paragraphMark.bounds, t)
		} } : {},
		...e.lineNumbers ? { lineNumbers: e.lineNumbers.map((e) => ({
			...e,
			bounds: Z(e.bounds, t),
			paintOps: e.paintOps.map((e) => ({
				...e,
				origin: zm(e.origin, t)
			}))
		})) } : {}
	};
	return n.memo.set(e, {
		key: r,
		value: u
	}), u;
}
function Zm(e, t) {
	return Qm(e, t, {
		memo: /* @__PURE__ */ new WeakMap(),
		drawingMemo: /* @__PURE__ */ new WeakMap()
	});
}
function Qm(e, t, n) {
	let r = e.verticalMode === void 0;
	return {
		...e,
		flowBounds: Z(e.flowBounds, t),
		inkBounds: Z(e.inkBounds, t),
		...e.clipBounds ? { clipBounds: r ? Z(e.clipBounds, t) : e.clipBounds } : {},
		...e.contentBounds ? { contentBounds: r ? Z(e.contentBounds, t) : e.contentBounds } : {},
		transform: r ? e.transform : {
			...e.transform,
			e: e.transform.e + t.xPt,
			f: e.transform.f + t.yPt
		},
		story: r ? {
			...e.story,
			flowBounds: Z(e.story.flowBounds, t),
			inkBounds: Z(e.story.inkBounds, t),
			...e.story.clipBounds ? { clipBounds: Z(e.story.clipBounds, t) } : {},
			blocks: e.story.blocks.map((e) => {
				if (e.kind === "paragraph") return Xm(e, t, n);
				if (e.kind === "table") return eh(e, t);
				throw Error(`Text-box story contains unsupported retained node: ${e.kind}`);
			})
		} : e.story
	};
}
function $m(e, t) {
	return Ym(e, t);
}
function eh(e, t) {
	return {
		...e,
		flowBounds: Z(e.flowBounds, t),
		inkBounds: Z(e.inkBounds, t),
		...e.clipBounds ? { clipBounds: Z(e.clipBounds, t) } : {},
		borders: e.borders.map((e) => Bm(e, t)),
		rows: e.rows.map((e) => ({
			...e,
			flowBounds: Z(e.flowBounds, t),
			inkBounds: Z(e.inkBounds, t),
			...e.clipBounds ? { clipBounds: Z(e.clipBounds, t) } : {},
			cells: e.cells.map((e) => ({
				...e,
				flowBounds: Z(e.flowBounds, t),
				inkBounds: Z(e.inkBounds, t),
				...e.clipBounds ? { clipBounds: Z(e.clipBounds, t) } : {},
				contentBounds: Z(e.contentBounds, t),
				blocks: e.blocks
			}))
		}))
	};
}
//#endregion
//#region packages/docx/src/layout/occurrence-projection.ts
function th(e, t) {
	return `${e}/occurrence/${encodeURIComponent(t).replaceAll("%3A", ":")}`;
}
function nh(e) {
	if (!Number.isFinite(e.xPt) || !Number.isFinite(e.yPt)) throw RangeError("body occurrence translation must be finite");
}
function rh(e) {
	if (e.occurrenceId.length === 0) throw RangeError("occurrenceId must not be empty");
	if (e.destination.flowDomainId.length === 0) throw RangeError("flowDomainId must not be empty");
	nh(e.destination.translation);
}
function ih(e, t) {
	let n = Rm(e.positioning);
	return {
		xPt: n.x ? t.xPt : 0,
		yPt: n.y ? t.yPt : 0
	};
}
function ah(e) {
	let t = /* @__PURE__ */ new WeakSet(), n = /* @__PURE__ */ new WeakSet(), r = (e) => {
		if (t.has(e)) throw TypeError("body occurrence layout graph must be acyclic");
		if (!n.has(e)) {
			if (t.add(e), e.kind === "paragraph") for (let t of e.textBoxes) for (let e of t.story.blocks) (e.kind === "paragraph" || e.kind === "table") && r(e);
			else {
				for (let t of e.rows) for (let e of t.cells) for (let t of e.blocks) r(t.layout);
				for (let t of e.floatingTables ?? []) r(t.child);
				for (let t of e.resolvedFloatingTables ?? []) r(t.source.child), r(t.child);
			}
			t.delete(e), n.add(e);
		}
	};
	r(e);
}
function oh(e, t) {
	ah(e);
	let n = /* @__PURE__ */ new WeakMap(), r = /* @__PURE__ */ new WeakMap(), i = (e) => `${e.xPt}\u0000${e.yPt}`, a = (e, t) => {
		let n = i(t), a = r.get(e);
		if (a) {
			if (a.key !== n) throw Error("incompatible projection ownership");
			return a.value;
		}
		let o = $m(e, t), s = Object.freeze({
			...o,
			...e.sectionFlowOwnership === void 0 ? {} : { sectionFlowOwnership: e.sectionFlowOwnership }
		});
		return r.set(e, {
			key: n,
			value: s
		}), s;
	}, o = (e, t) => {
		let r = i(t), a = n.get(e);
		if (a) {
			if (a.key !== r) throw Error("incompatible projection ownership");
			return a.value;
		}
		let s = {
			...eh(e, t),
			...e.sectionFlowOwnership === void 0 ? {} : { sectionFlowOwnership: e.sectionFlowOwnership }
		};
		n.set(e, {
			key: r,
			value: s
		});
		let c = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Set();
		for (let n of e.resolvedFloatingTables ?? []) {
			let r = e.resolvedFloatingTableCoordinateSpace !== void 0;
			c.set(n.source, r ? {
				xPt: 0,
				yPt: 0
			} : ih(n.source, t)), r && l.add(n.source);
		}
		let u = /* @__PURE__ */ new Map(), d = (e) => {
			let n = u.get(e);
			if (n) return n;
			let r = c.get(e) ?? t, i = l.has(e) ? {
				xPt: 0,
				yPt: 0
			} : t, a = {
				...e,
				anchorBounds: Z(e.anchorBounds, i),
				...e.columnBounds ? { columnBounds: Z(e.columnBounds, i) } : {},
				child: o(e.child, r)
			};
			return u.set(e, a), a;
		}, f = (e.floatingTables ?? []).map(d), p = (e.resolvedFloatingTables ?? []).map((e) => {
			let n = d(e.source), r = c.get(e.source) ?? ih(e.source, t);
			return {
				...e,
				xPt: e.xPt + r.xPt,
				yPt: e.yPt + r.yPt,
				bounds: Z(e.bounds, r),
				exclusionBounds: Z(e.exclusionBounds, r),
				child: n.child,
				source: n
			};
		});
		return (e.floatingTables || e.resolvedFloatingTables) && Object.assign(s, {
			floatingTables: f,
			resolvedFloatingTables: p
		}), s;
	};
	return e.kind === "paragraph" ? a(e, t) : o(e, t);
}
function sh(e, t) {
	return nh(t), oh(e, t);
}
function ch(e, t) {
	rh(t);
	let n = oh(e, t.destination.translation), r = encodeURIComponent(t.occurrenceId), i = /* @__PURE__ */ new WeakMap(), a = /* @__PURE__ */ new WeakMap(), o = /* @__PURE__ */ new WeakMap(), s = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map(), l = (e) => `${t.occurrenceId}/node/${encodeURIComponent(e)}`, u = (e) => `${t.occurrenceId}/anchor/${encodeURIComponent(e)}`, d = (e) => th(t.occurrenceId, e), f = (e, n) => `${t.destination.flowDomainId}/occurrence/${r}/${e}/${encodeURIComponent(n)}`, p = (e) => e.kind === "drawing" ? {
		...e,
		drawingId: l(e.drawingId)
	} : e.kind === "anchor-host" && e.anchorOccurrenceId ? {
		...e,
		anchorOccurrenceId: u(e.anchorOccurrenceId)
	} : e, m = (e, t) => {
		let n = o.get(e);
		if (n) {
			if (n.domain !== t) throw Error("incompatible projection ownership");
			return n.value;
		}
		if (e.anchorLayer) {
			let t = s.get(e.anchorLayer.occurrenceId);
			if (t && t !== e) throw Error("duplicate anchor occurrence owner");
			s.set(e.anchorLayer.occurrenceId, e);
		}
		let r = {
			...e,
			id: l(e.id),
			flowDomainId: t,
			...e.textBoxIds ? { textBoxIds: e.textBoxIds.map(l) } : {},
			...e.anchorLayer ? { anchorLayer: {
				...e.anchorLayer,
				occurrenceId: u(e.anchorLayer.occurrenceId),
				acquisitionOccurrenceId: e.anchorLayer.acquisitionOccurrenceId ?? e.anchorLayer.occurrenceId
			} } : {}
		};
		return o.set(e, {
			domain: t,
			value: r
		}), r;
	}, h = (e) => {
		let t = f("textbox", e.id);
		return {
			...e,
			id: l(e.id),
			flowDomainId: t,
			story: {
				...e.story,
				blocks: e.story.blocks.map((e) => {
					if (e.kind === "paragraph") return g(e, t);
					if (e.kind === "table") return b(e, t);
					throw Error(`Text-box story contains unsupported retained node: ${e.kind}`);
				})
			}
		};
	}, g = (e, t) => {
		let n = a.get(e);
		if (n) {
			if (n.domain !== t) throw Error("incompatible projection ownership");
			return n.value;
		}
		let r = {
			...e,
			id: l(e.id),
			flowDomainId: t,
			lines: e.lines.map((e) => ({
				...e,
				placements: e.placements.map(p)
			})),
			drawings: e.drawings.map((e) => m(e, t)),
			textBoxes: e.textBoxes.map(h),
			exclusions: e.exclusions.map((e) => ({
				...e,
				id: e.verticalOwnership === "page" && !e.anchorOccurrenceId ? e.id : l(e.id),
				...e.anchorOccurrenceId ? { anchorOccurrenceId: u(e.anchorOccurrenceId) } : {}
			})),
			...e.anchorCollisions ? { anchorCollisions: e.anchorCollisions.map((e) => ({
				...e,
				occurrenceId: u(e.occurrenceId)
			})) } : {},
			...e.anchorFrames ? { anchorFrames: e.anchorFrames.map((e) => ({
				...e,
				occurrenceId: u(e.occurrenceId)
			})) } : {}
		};
		return a.set(e, {
			domain: t,
			value: r
		}), r;
	}, _ = (e) => {
		let t = f("cell", e.id);
		return {
			...e,
			id: l(e.id),
			flowDomainId: t,
			blocks: e.blocks.map((e) => ({
				...e,
				layout: x(e.layout, t)
			}))
		};
	}, v = (e, t) => ({
		...e,
		id: l(e.id),
		flowDomainId: t,
		..."occurrenceId" in e && typeof e.occurrenceId == "string" ? { occurrenceId: d(e.occurrenceId) } : {},
		cells: e.cells.map(_)
	}), y = (e) => {
		let t = f("cell", e.hostCellId);
		return {
			...e,
			occurrenceId: d(e.occurrenceId),
			hostCellId: l(e.hostCellId),
			tableId: l(e.tableId),
			child: b(e.child, t)
		};
	}, b = (e, t) => {
		let n = i.get(e);
		if (n) {
			if (n.domain !== t) throw Error("incompatible projection ownership");
			return n.value;
		}
		let r = {
			...e,
			id: l(e.id),
			flowDomainId: t,
			rows: e.rows.map((e) => v(e, t))
		};
		i.set(e, {
			domain: t,
			value: r
		});
		let a = /* @__PURE__ */ new Map(), o = (e) => {
			let t = a.get(e);
			if (t) return t;
			let n = c.get(e.occurrenceId);
			if (n && n !== e) throw Error("duplicate floating placement occurrence owner");
			c.set(e.occurrenceId, e);
			let r = y(e);
			return a.set(e, r), r;
		}, s = (e.floatingTables ?? []).map(o), u = (e.resolvedFloatingTables ?? []).map((e) => {
			let t = o(e.source);
			return {
				...e,
				occurrenceId: d(e.occurrenceId),
				child: t.child,
				source: t
			};
		});
		return (e.floatingTables || e.resolvedFloatingTables) && Object.assign(r, {
			floatingTables: s,
			resolvedFloatingTables: u
		}), r;
	};
	function x(e, t) {
		return e.kind === "paragraph" ? g(e, t) : b(e, t);
	}
	let S = H(x(n, t.destination.flowDomainId), "DOCX body occurrence projection");
	if (S.kind !== "table" || e.kind !== "table") return S;
	let C = Object.isFrozen(e.columnWidthsPt) ? e.columnWidthsPt : Object.freeze([...e.columnWidthsPt]);
	return Object.freeze({
		...S,
		columnWidthsPt: C
	});
}
//#endregion
//#region packages/docx/src/layout/paginator.ts
var lh = class extends Error {
	code = "NEXT_COLUMN_DESTINATION_UNAVAILABLE";
	constructor(e, t, n, r) {
		super(`nextColumn requires a following column on the current page, but column ${e + 1} is unavailable (outgoing columns: ${t}, incoming columns: ${n}, reason: ${r})`), this.outgoingColumnIndex = e, this.outgoingColumnCount = t, this.incomingColumnCount = n, this.reason = r, this.name = "UnsupportedPageFlowTransitionError";
	}
};
function uh(e, t) {
	return e.sectionBidi ? [...t].reverse() : [...t];
}
function dh(e) {
	let t = uh(e.section, e.columnSubset);
	return t[t.indexOf(e.columnIndex) + 1];
}
function fh(e, t = {}) {
	let n = gc(e), r = _c(e), i = t.pageContentStartBlockPt ?? n, a = t.pageContentEndBlockPt ?? r, o = t.regionStartBlockPt ?? i, s = t.regionEndBlockPt ?? a, c = t.cursorBlockPt ?? o, l = t.deepestColumnBlockPt ?? c, u = t.pageIndex ?? 0, d = Object.freeze([...t.columnSubset ?? e.columns.map((e, t) => t)]), f = uh(e, d), p = t.columnIndex ?? f[0] ?? -1;
	if (!Number.isInteger(u) || u < 0) throw RangeError("Page index must be a non-negative integer");
	if (!Number.isInteger(p) || p < 0 || p >= e.columns.length) throw RangeError("Column index must identify a column in the active section");
	if (d.length === 0 || d.some((t, n) => !Number.isInteger(t) || t < 0 || t >= e.columns.length || n > 0 && t <= d[n - 1]) || !d.includes(p)) throw RangeError("Column subset must be ordered, unique, and contain the active column");
	if (![
		i,
		a,
		o,
		s,
		c,
		l
	].every(Number.isFinite)) throw RangeError("Page-flow cursors and bounds must be finite");
	if (i > o || o > s || s > a || o > c || c > s || c > l) throw RangeError("Page-flow bounds must contain the region and live cursor");
	return Object.freeze({
		pageIndex: u,
		columnIndex: p,
		pageHasContent: t.pageHasContent ?? !1,
		cursorBlockPt: c,
		pageContentStartBlockPt: i,
		pageContentEndBlockPt: a,
		regionStartBlockPt: o,
		regionEndBlockPt: s,
		columnSubset: d,
		deepestColumnBlockPt: l,
		section: e
	});
}
function ph(e, t) {
	return Object.freeze({
		state: e,
		events: Object.freeze(t.map((e) => Object.freeze({ ...e })))
	});
}
function mh(e, t, n) {
	if (!Number.isFinite(n) || n < 0) throw RangeError("A flow node charge must be a finite non-negative value");
	let r = e.cursorBlockPt, i = r + n;
	return ph(Object.freeze({
		...e,
		pageHasContent: !0,
		cursorBlockPt: i,
		deepestColumnBlockPt: Math.max(e.deepestColumnBlockPt, i)
	}), [{
		type: "place",
		node: t,
		blockStartPt: r,
		blockEndPt: i
	}]);
}
function hh(e, t) {
	let n = Math.max(e.deepestColumnBlockPt, e.cursorBlockPt), r = dh(e);
	if (r !== void 0) return ph(Object.freeze({
		...e,
		columnIndex: r,
		cursorBlockPt: e.regionStartBlockPt,
		deepestColumnBlockPt: n
	}), [{ type: "next-column" }]);
	let i = e.pageIndex + 1;
	return ph(fh(e.section, { pageIndex: i }), [{
		type: "next-page",
		reason: t,
		pageIndex: i,
		sectionOccurrenceId: e.section.sectionOccurrenceId,
		parityBlank: !1
	}]);
}
function gh(e, t) {
	return e.kind === t.kind && e.linePitchPt === t.linePitchPt && e.charSpacePt === t.charSpacePt;
}
function _h(e, t) {
	return e.xPt === t.xPt && e.yPt === t.yPt && e.widthPt === t.widthPt && e.heightPt === t.heightPt;
}
function vh(e, t) {
	return e.xPt < t.xPt + t.widthPt && t.xPt < e.xPt + e.widthPt && e.yPt < t.yPt + t.heightPt && t.yPt < e.yPt + e.heightPt;
}
function yh(e, t, n) {
	let r = (n) => {
		throw new lh(e.columnIndex, e.section.columns.length, t.columns.length, n);
	}, i = Td(e.section.textDirection), a = Td(t.textDirection);
	i !== a && r("writing-mode");
	let o = jd({
		widthPt: e.section.geometry.pageWidth,
		heightPt: e.section.geometry.pageHeight
	}, i), s = jd({
		widthPt: t.geometry.pageWidth,
		heightPt: t.geometry.pageHeight
	}, a);
	(o.widthPt !== s.widthPt || o.heightPt !== s.heightPt) && r("page-extent");
	let c = n.incomingPageContentStartBlockPt ?? gc(t), l = n.incomingPageContentEndBlockPt ?? _c(t);
	(c !== e.pageContentStartBlockPt || l !== e.pageContentEndBlockPt) && r("block-band"), gh(e.section.grid, t.grid) || r("grid");
	let u = uh(e.section, e.columnSubset), d = u.indexOf(e.columnIndex), f = u[d + 1];
	if (f === void 0) throw Error("nextColumn destination resolution requires a same-page successor");
	let p = Ld(i, o), m = e.section.columns[f], h = Fd(p.logicalToPhysical, {
		xPt: m.xPt,
		yPt: e.regionStartBlockPt,
		widthPt: m.wPt,
		heightPt: e.regionEndBlockPt - e.regionStartBlockPt
	}), g = t.columns.findIndex((t) => _h(h, Fd(p.logicalToPhysical, {
		xPt: t.xPt,
		yPt: e.regionStartBlockPt,
		widthPt: t.wPt,
		heightPt: e.regionEndBlockPt - e.regionStartBlockPt
	})));
	g < 0 && r("physical-column");
	let _ = uh(t, t.columns.map((e, t) => t)), v = _.indexOf(g);
	v < 0 && r("physical-column");
	let y = Object.freeze(_.slice(v).sort((e, t) => e - t)), b = Object.freeze(u.slice(0, d + 1).sort((e, t) => e - t)), x = (t, n) => {
		let r = t.columns[n];
		return Fd(p.logicalToPhysical, {
			xPt: r.xPt,
			yPt: e.regionStartBlockPt,
			widthPt: r.wPt,
			heightPt: e.regionEndBlockPt - e.regionStartBlockPt
		});
	}, S = b.map((t) => x(e.section, t));
	return y.some((e) => {
		let n = x(t, e);
		return S.some((e) => vh(e, n));
	}) && r("physical-overlap"), Object.freeze({
		targetColumnIndex: g,
		targetColumnOrdinal: v,
		columnSubset: y,
		outgoingColumnSubset: b
	});
}
function bh(e, t, n) {
	let r = e.pageIndex + 1;
	return ph(fh(t, { pageIndex: r }), [{
		type: "next-page",
		reason: n,
		pageIndex: r,
		sectionOccurrenceId: t.sectionOccurrenceId,
		parityBlank: !1
	}]);
}
function xh(e, t) {
	let n = e % 2 == 0;
	return t === "odd" ? n : !n;
}
function Sh(e, t, n, r) {
	let i = e.pageIndex + 1, a = [];
	return r !== void 0 && !xh(i, r) && (a.push({
		type: "next-page",
		reason: "parity",
		pageIndex: i,
		sectionOccurrenceId: e.section.sectionOccurrenceId,
		parityBlank: !0
	}), i += 1), a.push({
		type: "next-page",
		reason: n,
		pageIndex: i,
		sectionOccurrenceId: t.sectionOccurrenceId,
		parityBlank: !1
	}), ph(fh(t, { pageIndex: i }), a);
}
function Ch(e, t, n) {
	return t === "lastRenderedPageBreak" ? ph(e, []) : t === "column" ? hh(e, "explicit-break") : t === "pageBreakBefore" && !e.pageHasContent && e.columnIndex === uh(e.section, e.columnSubset)[0] && e.cursorBlockPt === e.pageContentStartBlockPt ? ph(e, []) : t === "page" ? Sh(e, e.section, "explicit-break", n) : bh(e, e.section, "page-break-before");
}
function wh(e, t, n, r = {}) {
	if (n === "continuous" && !r.hasFootnoteReferenceOnCurrentPage) {
		let n = e.section.columns.length > 1 ? Math.max(e.cursorBlockPt, e.deepestColumnBlockPt) : e.cursorBlockPt;
		return ph(fh(t, {
			pageIndex: e.pageIndex,
			pageContentStartBlockPt: e.pageContentStartBlockPt,
			pageContentEndBlockPt: e.pageContentEndBlockPt,
			cursorBlockPt: n,
			regionStartBlockPt: n,
			regionEndBlockPt: e.pageContentEndBlockPt,
			deepestColumnBlockPt: n,
			pageHasContent: e.pageHasContent
		}), [{
			type: "begin-section",
			placement: "same-page-block",
			section: t,
			targetColumnOrdinal: 0,
			columnSubset: t.columns.map((e, t) => t)
		}]);
	}
	if (n === "nextColumn") {
		if (dh(e) === void 0) {
			let n = bh(e, t, "section-break");
			return ph(n.state, [...n.events, {
				type: "begin-section",
				section: t
			}]);
		}
		let n = yh(e, t, r);
		return ph(Object.freeze({
			...e,
			columnIndex: n.targetColumnIndex,
			columnSubset: n.columnSubset,
			cursorBlockPt: e.regionStartBlockPt,
			deepestColumnBlockPt: Math.max(e.deepestColumnBlockPt, e.cursorBlockPt),
			section: t
		}), [{ type: "next-column" }, {
			type: "begin-section",
			placement: "same-page-column",
			section: t,
			targetColumnOrdinal: n.targetColumnOrdinal,
			columnSubset: n.columnSubset,
			outgoingColumnSubset: n.outgoingColumnSubset
		}]);
	}
	if (n === "continuous") {
		let n = bh(e, t, "section-break");
		return ph(n.state, [...n.events, {
			type: "begin-section",
			section: t
		}]);
	}
	let i = Sh(e, t, "section-break", n === "oddPage" ? "odd" : n === "evenPage" ? "even" : void 0);
	return ph(i.state, [...i.events, {
		type: "begin-section",
		section: t
	}]);
}
//#endregion
//#region packages/docx/src/line-fit-policy.ts
function Th(e, t, n, r) {
	let i = e, a = 0;
	for (let o = e + 1; o <= t; o++) {
		let e = r(o);
		if (!(e <= n)) break;
		i = o, a = e;
	}
	return {
		end: i,
		fitValue: a
	};
}
function Eh(e) {
	return !e.widowControl || e.end >= e.totalLines ? { kind: "keep" } : e.totalLines - e.end === 1 && e.end - e.start >= 2 ? { kind: "dropLastLine" } : e.start === 0 && e.end - e.start === 1 && e.canRelocate ? { kind: "relocate" } : { kind: "keep" };
}
//#endregion
//#region packages/docx/src/layout/float-wrap-oracle.ts
function Dh(e, t) {
	let n = e.map((e) => Object.freeze({ ...e })), r = aa(n);
	return {
		lineWindow: ({ topYPt: e, minimumStartWidthPt: n, squareMinimumStartWidthPt: i, probeHeightPt: a, paragraphXPt: o, maximumWidthPt: s, columnXPt: c, columnWidthPt: l }) => {
			let u = Ca(e, n, a, o, s, r, c, c + l, t ?? {
				xLeftPt: o,
				xRightPt: o + s,
				readingDirection: "ltr"
			}, i ?? n);
			return {
				topYPt: u.topY,
				xOffsetPt: u.xOffset,
				maximumWidthPt: u.maxWidth
			};
		},
		skipTopAndBottomBands: ({ yPt: e, columnXPt: t, columnWidthPt: r }) => wa(e, n, t, t + r)
	};
}
//#endregion
//#region packages/docx/src/paragraph-measure.ts
function Oh(e) {
	return {
		type: e.lineGrid.active ? "lines" : null,
		linePitchPt: e.lineGrid.active ? e.lineGrid.pitchPt : null,
		charSpacePt: e.characterGrid.active ? e.characterGrid.deltaPt : null
	};
}
function kh(e, t) {
	if (!Io(t)) return e;
	let n = t.linePitchPt;
	return n <= 0 ? e : e <= n ? n : Math.ceil(e / n) * n;
}
function Ah(e, t, n, r, i, a) {
	let o = Oh(t), s = Math.max(1, n.availableWidthPt - t.physicalIndentLeftPt - t.physicalIndentRightPt), c = n.paragraphXPt + t.physicalIndentLeftPt, l = t.spaceBeforePt, u = t.spaceAfterPt, d = Object.freeze({ ...n }), f = r.fontFamilyClasses, p = i.documentHasEastAsianText === !0 || i.useFeLayout === !0, m = n.startYPt + (n.suppressSpaceBefore ? 0 : l);
	n.wrap && (m = n.wrap.skipTopAndBottomBands({
		yPt: m,
		columnXPt: n.paragraphXPt,
		columnWidthPt: n.availableWidthPt
	}));
	let h = () => {
		let a = m, h = Uo(e, 1, o, t.hasRuby, p, r.context, f, t.lineSpacing, i.resolvedLocalFonts, i.layoutServices?.text, i.paragraphMarkShapeInput);
		return n.wrap && (a = n.wrap.lineWindow({
			topYPt: a,
			minimumStartWidthPt: xo(e),
			squareMinimumStartWidthPt: Ai(xo(e), 1),
			probeHeightPt: h,
			paragraphXPt: c,
			maximumWidthPt: s,
			columnXPt: n.paragraphXPt,
			columnWidthPt: n.availableWidthPt
		}).topYPt), {
			lines: [],
			markOnly: !0,
			requestedSpaceBeforePt: l,
			requestedSpaceAfterPt: u,
			uniformRubyAdvancePt: 0,
			contentStartYPt: a,
			contentEndYPt: a + h,
			lastLineBelowBaselinePt: Go(e, o, t.hasRuby, p, r.context, f, t.lineSpacing, i.resolvedLocalFonts, i.layoutServices?.text, i.paragraphMarkShapeInput),
			placement: d
		};
	}, g = ms(e.runs, i);
	if (g.length === 0) return h();
	let _ = n.wrap ? {
		startPageY: m,
		paraX: c,
		columnXPt: n.paragraphXPt,
		columnWidthPt: n.availableWidthPt,
		floats: [],
		paragraphMarkLineStartWidth: Ai(xo(e), 1),
		lineWindow: (e) => n.wrap.lineWindow(e),
		lineBoxH: (e, n, r, i, a, s) => zo(t.lineSpacing, e, n, 1, o, t.hasRuby, i ?? 0, t.hasRuby ? t.hasEastAsianText : a ?? !1, s),
		pageH: n.maximumYPt
	} : void 0, v = hs(r.context, g, s, a ? 0 : t.firstIndentPt, 1, [...t.tabStops], _, f, t.physicalIndentLeftPt, t.kinsoku, t.characterGrid.active ? t.characterGrid.deltaPt : 0, t.defaultTabPt, s + t.physicalIndentRightPt, t.baseRtl, t.isJustified, t.stretchLastLine, a?.boundary, void 0, i.verticalGlyphMeasurement, t.overflowPunct !== !1);
	if (v.length === 0) return h();
	let y = t.hasRuby ? kh(Math.max(0, ...v.map((e) => zo(t.lineSpacing, e.ascent, e.descent, 1, o, !0, e.intendedSingle, t.hasEastAsianText))), o) : 0;
	t.hasRuby && a?.uniformRubyAdvancePt !== void 0 && (y = Math.max(y, a.uniformRubyAdvancePt));
	let b = [];
	for (let e of v) {
		let n = e.topY !== void 0 && e.topY > m ? e.topY : m, r = t.hasRuby ? y : zo(t.lineSpacing, e.ascent, e.descent, 1, o, !1, e.intendedSingle, e.eastAsian ?? !1, e.gridCountSingle);
		b.push({
			layout: e,
			topYPt: n,
			advancePt: r
		}), m = n + r;
	}
	let x = b[b.length - 1];
	return {
		lines: b,
		markOnly: !1,
		requestedSpaceBeforePt: l,
		requestedSpaceAfterPt: u,
		uniformRubyAdvancePt: y,
		contentStartYPt: b[0].topYPt,
		contentEndYPt: m,
		lastLineBelowBaselinePt: Wo(x.advancePt, x.layout.ascent, x.layout.descent),
		placement: d
	};
}
//#endregion
//#region packages/docx/src/text-distribute.ts
function jh(e, t, n, r, i = -Infinity, a = !0, o = !1) {
	return Ue(e, t, {
		firstContentSi: n,
		lastDrawnSi: r,
		minPerGap: i,
		seaClusterGaps: o,
		...a ? {} : { isGapChar: () => !1 }
	});
}
function Mh(e) {
	if (!e) return 0;
	let t = 0;
	for (let n of e.perSeg.values()) t += n.splitBefore.length + +!!n.trailingGap;
	return e.perGap * t;
}
function Nh(e, t, n, r, i) {
	return t >= 0 ? null : jh(e, t, n, r, -i * .25, !1);
}
//#endregion
//#region packages/docx/src/arabic-joining.generated.ts
var Ph = [
	"U",
	"C",
	"D",
	"L",
	"R",
	"T"
], Fh = [
	0,
	173,
	174,
	768,
	880,
	1155,
	1162,
	1425,
	1470,
	1471,
	1472,
	1473,
	1475,
	1476,
	1478,
	1479,
	1480,
	1552,
	1563,
	1564,
	1565,
	1568,
	1569,
	1570,
	1574,
	1575,
	1576,
	1577,
	1578,
	1583,
	1587,
	1600,
	1601,
	1608,
	1609,
	1611,
	1632,
	1646,
	1648,
	1649,
	1652,
	1653,
	1656,
	1672,
	1690,
	1728,
	1729,
	1731,
	1740,
	1741,
	1742,
	1743,
	1744,
	1746,
	1748,
	1749,
	1750,
	1757,
	1759,
	1765,
	1767,
	1769,
	1770,
	1774,
	1776,
	1786,
	1789,
	1791,
	1792,
	1807,
	1808,
	1809,
	1810,
	1813,
	1818,
	1822,
	1823,
	1832,
	1833,
	1834,
	1835,
	1836,
	1837,
	1839,
	1840,
	1867,
	1869,
	1870,
	1881,
	1884,
	1899,
	1901,
	1905,
	1906,
	1907,
	1909,
	1912,
	1914,
	1920,
	1958,
	1969,
	1994,
	2027,
	2036,
	2042,
	2043,
	2045,
	2046,
	2070,
	2074,
	2075,
	2084,
	2085,
	2088,
	2089,
	2094,
	2112,
	2113,
	2118,
	2120,
	2121,
	2122,
	2132,
	2133,
	2134,
	2137,
	2140,
	2144,
	2145,
	2146,
	2150,
	2151,
	2152,
	2153,
	2155,
	2160,
	2179,
	2182,
	2183,
	2185,
	2190,
	2191,
	2192,
	2199,
	2208,
	2218,
	2221,
	2222,
	2223,
	2225,
	2227,
	2233,
	2234,
	2249,
	2250,
	2274,
	2275,
	2307,
	2362,
	2363,
	2364,
	2365,
	2369,
	2377,
	2381,
	2382,
	2385,
	2392,
	2402,
	2404,
	2433,
	2434,
	2492,
	2493,
	2497,
	2501,
	2509,
	2510,
	2530,
	2532,
	2558,
	2559,
	2561,
	2563,
	2620,
	2621,
	2625,
	2627,
	2631,
	2633,
	2635,
	2638,
	2641,
	2642,
	2672,
	2674,
	2677,
	2678,
	2689,
	2691,
	2748,
	2749,
	2753,
	2758,
	2759,
	2761,
	2765,
	2766,
	2786,
	2788,
	2810,
	2816,
	2817,
	2818,
	2876,
	2877,
	2879,
	2880,
	2881,
	2885,
	2893,
	2894,
	2901,
	2903,
	2914,
	2916,
	2946,
	2947,
	3008,
	3009,
	3021,
	3022,
	3072,
	3073,
	3076,
	3077,
	3132,
	3133,
	3134,
	3137,
	3142,
	3145,
	3146,
	3150,
	3157,
	3159,
	3170,
	3172,
	3201,
	3202,
	3260,
	3261,
	3263,
	3264,
	3270,
	3271,
	3276,
	3278,
	3298,
	3300,
	3328,
	3330,
	3387,
	3389,
	3393,
	3397,
	3405,
	3406,
	3426,
	3428,
	3457,
	3458,
	3530,
	3531,
	3538,
	3541,
	3542,
	3543,
	3633,
	3634,
	3636,
	3643,
	3655,
	3663,
	3761,
	3762,
	3764,
	3773,
	3784,
	3791,
	3864,
	3866,
	3893,
	3894,
	3895,
	3896,
	3897,
	3898,
	3953,
	3967,
	3968,
	3973,
	3974,
	3976,
	3981,
	3992,
	3993,
	4029,
	4038,
	4039,
	4141,
	4145,
	4146,
	4152,
	4153,
	4155,
	4157,
	4159,
	4184,
	4186,
	4190,
	4193,
	4209,
	4213,
	4226,
	4227,
	4229,
	4231,
	4237,
	4238,
	4253,
	4254,
	4957,
	4960,
	5906,
	5909,
	5938,
	5940,
	5970,
	5972,
	6002,
	6004,
	6068,
	6070,
	6071,
	6078,
	6086,
	6087,
	6089,
	6100,
	6109,
	6110,
	6151,
	6152,
	6154,
	6155,
	6158,
	6159,
	6160,
	6176,
	6265,
	6277,
	6279,
	6313,
	6314,
	6315,
	6432,
	6435,
	6439,
	6441,
	6450,
	6451,
	6457,
	6460,
	6679,
	6681,
	6683,
	6684,
	6742,
	6743,
	6744,
	6751,
	6752,
	6753,
	6754,
	6755,
	6757,
	6765,
	6771,
	6781,
	6783,
	6784,
	6832,
	6878,
	6880,
	6892,
	6912,
	6916,
	6964,
	6965,
	6966,
	6971,
	6972,
	6973,
	6978,
	6979,
	7019,
	7028,
	7040,
	7042,
	7074,
	7078,
	7080,
	7082,
	7083,
	7086,
	7142,
	7143,
	7144,
	7146,
	7149,
	7150,
	7151,
	7154,
	7212,
	7220,
	7222,
	7224,
	7376,
	7379,
	7380,
	7393,
	7394,
	7401,
	7405,
	7406,
	7412,
	7413,
	7416,
	7418,
	7616,
	7680,
	8203,
	8204,
	8205,
	8206,
	8208,
	8234,
	8239,
	8288,
	8293,
	8298,
	8304,
	8400,
	8433,
	11503,
	11506,
	11647,
	11648,
	11744,
	11776,
	12330,
	12334,
	12441,
	12443,
	42607,
	42611,
	42612,
	42622,
	42654,
	42656,
	42736,
	42738,
	43010,
	43011,
	43014,
	43015,
	43019,
	43020,
	43045,
	43047,
	43052,
	43053,
	43072,
	43122,
	43123,
	43204,
	43206,
	43232,
	43250,
	43263,
	43264,
	43302,
	43310,
	43335,
	43346,
	43392,
	43395,
	43443,
	43444,
	43446,
	43450,
	43452,
	43454,
	43493,
	43494,
	43561,
	43567,
	43569,
	43571,
	43573,
	43575,
	43587,
	43588,
	43596,
	43597,
	43644,
	43645,
	43696,
	43697,
	43698,
	43701,
	43703,
	43705,
	43710,
	43712,
	43713,
	43714,
	43756,
	43758,
	43766,
	43767,
	44005,
	44006,
	44008,
	44009,
	44013,
	44014,
	64286,
	64287,
	65024,
	65040,
	65056,
	65072,
	65279,
	65280,
	65529,
	65532,
	66045,
	66046,
	66272,
	66273,
	66422,
	66427,
	68097,
	68100,
	68101,
	68103,
	68108,
	68112,
	68152,
	68155,
	68159,
	68160,
	68288,
	68293,
	68294,
	68295,
	68296,
	68297,
	68299,
	68301,
	68302,
	68307,
	68311,
	68312,
	68317,
	68318,
	68321,
	68322,
	68324,
	68325,
	68327,
	68331,
	68335,
	68336,
	68480,
	68481,
	68482,
	68483,
	68486,
	68489,
	68490,
	68492,
	68493,
	68494,
	68496,
	68497,
	68498,
	68521,
	68525,
	68527,
	68864,
	68865,
	68898,
	68899,
	68900,
	68904,
	68969,
	68974,
	69291,
	69293,
	69314,
	69315,
	69317,
	69318,
	69320,
	69370,
	69376,
	69424,
	69427,
	69428,
	69445,
	69446,
	69457,
	69460,
	69461,
	69488,
	69492,
	69494,
	69506,
	69510,
	69552,
	69553,
	69554,
	69556,
	69559,
	69560,
	69561,
	69563,
	69565,
	69566,
	69568,
	69569,
	69570,
	69572,
	69573,
	69577,
	69578,
	69579,
	69580,
	69633,
	69634,
	69688,
	69703,
	69744,
	69745,
	69747,
	69749,
	69759,
	69762,
	69811,
	69815,
	69817,
	69819,
	69826,
	69827,
	69888,
	69891,
	69927,
	69932,
	69933,
	69941,
	70003,
	70004,
	70016,
	70018,
	70070,
	70079,
	70089,
	70093,
	70095,
	70096,
	70191,
	70194,
	70196,
	70197,
	70198,
	70200,
	70206,
	70207,
	70209,
	70210,
	70367,
	70368,
	70371,
	70379,
	70400,
	70402,
	70459,
	70461,
	70464,
	70465,
	70502,
	70509,
	70512,
	70517,
	70587,
	70593,
	70606,
	70607,
	70608,
	70609,
	70610,
	70611,
	70625,
	70627,
	70712,
	70720,
	70722,
	70725,
	70726,
	70727,
	70750,
	70751,
	70835,
	70841,
	70842,
	70843,
	70847,
	70849,
	70850,
	70852,
	71090,
	71094,
	71100,
	71102,
	71103,
	71105,
	71132,
	71134,
	71219,
	71227,
	71229,
	71230,
	71231,
	71233,
	71339,
	71340,
	71341,
	71342,
	71344,
	71350,
	71351,
	71352,
	71453,
	71454,
	71455,
	71456,
	71458,
	71462,
	71463,
	71468,
	71727,
	71736,
	71737,
	71739,
	71995,
	71997,
	71998,
	71999,
	72003,
	72004,
	72148,
	72152,
	72154,
	72156,
	72160,
	72161,
	72193,
	72203,
	72243,
	72249,
	72251,
	72255,
	72263,
	72264,
	72273,
	72279,
	72281,
	72284,
	72330,
	72343,
	72344,
	72346,
	72544,
	72545,
	72546,
	72549,
	72550,
	72551,
	72752,
	72759,
	72760,
	72766,
	72767,
	72768,
	72850,
	72872,
	72874,
	72881,
	72882,
	72884,
	72885,
	72887,
	73009,
	73015,
	73018,
	73019,
	73020,
	73022,
	73023,
	73030,
	73031,
	73032,
	73104,
	73106,
	73109,
	73110,
	73111,
	73112,
	73459,
	73461,
	73472,
	73474,
	73526,
	73531,
	73536,
	73537,
	73538,
	73539,
	73562,
	73563,
	78896,
	78913,
	78919,
	78934,
	90398,
	90410,
	90413,
	90416,
	92912,
	92917,
	92976,
	92983,
	94031,
	94032,
	94095,
	94099,
	94180,
	94181,
	113821,
	113823,
	113824,
	113828,
	118528,
	118574,
	118576,
	118599,
	119143,
	119146,
	119155,
	119171,
	119173,
	119180,
	119210,
	119214,
	119362,
	119365,
	121344,
	121399,
	121403,
	121453,
	121461,
	121462,
	121476,
	121477,
	121499,
	121504,
	121505,
	121520,
	122880,
	122887,
	122888,
	122905,
	122907,
	122914,
	122915,
	122917,
	122918,
	122923,
	123023,
	123024,
	123184,
	123191,
	123566,
	123567,
	123628,
	123632,
	124140,
	124144,
	124398,
	124400,
	124643,
	124644,
	124646,
	124647,
	124654,
	124656,
	124661,
	124662,
	125136,
	125143,
	125184,
	125252,
	125260,
	917505,
	917506,
	917536,
	917632,
	917760,
	918e3
], Ih = [
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	2,
	0,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	1,
	2,
	4,
	2,
	5,
	0,
	2,
	5,
	4,
	0,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	0,
	4,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	4,
	0,
	2,
	0,
	2,
	0,
	5,
	4,
	5,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	5,
	0,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	0,
	5,
	0,
	2,
	5,
	0,
	1,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	5,
	0,
	2,
	0,
	2,
	0,
	4,
	2,
	4,
	0,
	4,
	1,
	2,
	0,
	2,
	4,
	2,
	0,
	5,
	2,
	4,
	0,
	4,
	2,
	4,
	2,
	4,
	2,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	2,
	0,
	1,
	5,
	0,
	5,
	0,
	2,
	0,
	5,
	2,
	5,
	2,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	1,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	2,
	3,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	2,
	4,
	0,
	4,
	0,
	4,
	0,
	3,
	4,
	2,
	3,
	2,
	4,
	2,
	4,
	0,
	4,
	5,
	0,
	2,
	4,
	0,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	2,
	4,
	0,
	4,
	2,
	0,
	3,
	2,
	4,
	2,
	5,
	0,
	5,
	0,
	5,
	0,
	4,
	2,
	0,
	2,
	0,
	5,
	0,
	2,
	4,
	2,
	0,
	5,
	2,
	4,
	0,
	2,
	4,
	2,
	5,
	0,
	2,
	0,
	2,
	4,
	0,
	2,
	4,
	2,
	4,
	2,
	0,
	2,
	4,
	2,
	0,
	4,
	2,
	3,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0,
	2,
	5,
	0,
	5,
	0,
	5,
	0,
	5,
	0
], Lh = [
	1587,
	1588,
	1589,
	1590,
	1690,
	1691,
	1692,
	1693,
	1694,
	1786,
	1787,
	1884,
	1901,
	1904,
	1917,
	1918,
	2223
], Rh = [
	1580,
	1581,
	1582,
	1665,
	1666,
	1667,
	1668,
	1669,
	1670,
	1671,
	1727,
	1879,
	1880,
	1902,
	1903,
	1906,
	1916,
	2186,
	2210,
	2241,
	2245,
	2246
], zh = [
	1576,
	1578,
	1579,
	1646,
	1657,
	1658,
	1659,
	1660,
	1661,
	1662,
	1663,
	1664,
	1872,
	1873,
	1874,
	1875,
	1876,
	1877,
	1878,
	2208,
	2209,
	2230,
	2231,
	2232,
	2238,
	2239,
	2240
], Bh = [
	1574,
	1585,
	1586,
	1597,
	1598,
	1599,
	1609,
	1610,
	1656,
	1681,
	1682,
	1683,
	1684,
	1685,
	1686,
	1687,
	1688,
	1689,
	1740,
	1742,
	1744,
	1745,
	1775,
	1883,
	1899,
	1900,
	1905,
	1909,
	1910,
	1911,
	2216,
	2217,
	2218,
	2226,
	2233,
	2234,
	69319
], Vh = [
	1570,
	1571,
	1573,
	1575,
	1591,
	1592,
	1595,
	1596,
	1603,
	1604,
	1649,
	1650,
	1651,
	1653,
	1695,
	1705,
	1707,
	1708,
	1709,
	1710,
	1711,
	1712,
	1713,
	1714,
	1715,
	1716,
	1717,
	1718,
	1719,
	1720,
	1890,
	1891,
	1892,
	1898,
	1907,
	1908,
	1919,
	2160,
	2161,
	2162,
	2163,
	2164,
	2165,
	2166,
	2167,
	2168,
	2169,
	2170,
	2171,
	2172,
	2173,
	2174,
	2175,
	2176,
	2177,
	2178,
	2187,
	2188,
	2189,
	2211,
	2214,
	2224,
	2228,
	2242,
	2247,
	2248,
	69315,
	69316
], Hh = [
	1572,
	1593,
	1594,
	1601,
	1602,
	1608,
	1647,
	1654,
	1655,
	1696,
	1697,
	1698,
	1699,
	1700,
	1701,
	1702,
	1703,
	1704,
	1732,
	1733,
	1734,
	1735,
	1736,
	1737,
	1738,
	1739,
	1743,
	1788,
	1885,
	1886,
	1887,
	1888,
	1889,
	1912,
	1913,
	2212,
	2213,
	2219,
	2227,
	2229,
	2243
];
//#endregion
//#region packages/docx/src/arabic-joining.ts
function Uh(e) {
	let t = 0, n = Fh.length - 1, r = -1;
	for (; t <= n;) {
		let i = t + (n - t >> 1);
		Fh[i] <= e ? (r = i, t = i + 1) : n = i - 1;
	}
	return r < 0 ? "U" : Ph[Ih[r]] ?? "U";
}
function Wh(e) {
	let t = Uh(e);
	return t === "D" || t === "L" || t === "C";
}
function Gh(e) {
	let t = Uh(e);
	return t === "D" || t === "R" || t === "C";
}
var Kh = 1604, qh = new Set([
	1575,
	1570,
	1571,
	1573,
	1649
]), Jh = 1600, Yh = new Set(Lh), Xh = new Set(Rh), Zh = new Set(zh), Qh = new Set(Bh), $h = new Set(Vh), eg = new Set(Hh), tg = /* @__PURE__ */ function(e) {
	return e[e.Normal = 7] = "Normal", e[e.Waw = 8] = "Waw", e[e.BaRa = 9] = "BaRa", e[e.Alef = 10] = "Alef", e[e.HahDal = 11] = "HahDal", e[e.Seen = 12] = "Seen", e[e.Kashida = 13] = "Kashida", e;
}(tg || {});
function ng(e) {
	let t = [...e].map((e) => e.codePointAt(0)), n = [], r = t.length > 0 && Uh(t[0]) !== "T" ? 0 : -1;
	for (let e = 1; e < t.length; e++) {
		let i = t[e];
		if (Uh(i) !== "T") {
			if (r >= 0) {
				let a = t[r];
				!(a === Kh && qh.has(i)) && Wh(a) && Gh(i) && n.push(e);
			}
			r = e;
		}
	}
	return n;
}
function rg(e, t, n) {
	let r = t - 1;
	for (; r >= 0 && Uh(e[r]) === "T";) r--;
	let i = e[r], a = e[t];
	return i === Jh ? tg.Kashida : Yh.has(i) ? tg.Seen : Xh.has(i) ? tg.HahDal : no(t, n) && $h.has(a) ? tg.Alef : Zh.has(i) && Qh.has(a) ? tg.BaRa : no(t, n) && eg.has(a) ? tg.Waw : tg.Normal;
}
function ig(e) {
	let t = [...e], n = [];
	for (let e = 0; e < t.length;) {
		for (; e < t.length && /\s/u.test(t[e]);) e++;
		if (e >= t.length) break;
		let r = e + 1;
		for (; r < t.length && !/\s/u.test(t[r]);) r++;
		let i = t.slice(e, r), a = i.map((e) => e.codePointAt(0)), o = a.length - 1;
		for (; o >= 0 && Uh(a[o]) === "T";) o--;
		let s = -1, c = -1;
		for (let e of ng(i.join(""))) {
			let t = rg(a, e, o);
			t >= c && (s = e, c = t);
		}
		s >= 0 && n.push({
			beforeCp: e + s,
			priority: c
		}), e = r;
	}
	return n;
}
//#endregion
//#region packages/docx/src/kashida-justify.ts
var ag = "ـ";
function og(e, t) {
	let n = [...e], r = "";
	for (let e = 0; e < n.length; e++) {
		let i = t.get(e) ?? 0;
		i > 0 && (r += ag.repeat(i)), r += n[e];
	}
	return r;
}
function sg(e, t, n, r) {
	if (t <= .5) return null;
	let i = [];
	for (let t = 0; t < e.length; t++) {
		let n = e[t].text;
		if (n !== void 0) for (let { beforeCp: e, priority: r } of ig(n)) i.push({
			si: t,
			beforeCp: e,
			priority: r,
			textOrder: i.length
		});
	}
	if (i.length === 0) return null;
	i.sort((e, t) => t.priority - e.priority || e.textOrder - t.textOrder);
	let a = n === "low" ? 1 : n === "medium" ? 2 : Infinity, o = a, s = i.length * 64, c = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new Map();
	for (let { si: t } of i) {
		if (u.has(t)) continue;
		let n = r(t, e[t].text);
		l.set(t, n), u.set(t, n);
	}
	let d = t, f = 0;
	for (let t = 0; t < o && d > .5 && f < s; t++) {
		let t = !1;
		for (let { si: n, beforeCp: o } of i) {
			if (d <= .5 || f >= s) break;
			let i = c.get(n);
			i || (i = /* @__PURE__ */ new Map(), c.set(n, i));
			let l = i.get(o) ?? 0;
			if (l >= a) continue;
			i.set(o, l + 1);
			let p = r(n, og(e[n].text, i)), m = p - u.get(n);
			m > 0 && m <= d + 1e-6 ? (u.set(n, p), d -= m, f++, t = !0) : l === 0 ? i.delete(o) : i.set(o, l);
		}
		if (!t) break;
	}
	let p = /* @__PURE__ */ new Map();
	for (let [t, n] of c) {
		let r = [...n.entries()].filter(([, e]) => e > 0).sort(([e], [t]) => e - t).map(([e, t]) => ({
			beforeCp: e,
			count: t
		}));
		r.length !== 0 && p.set(t, {
			text: og(e[t].text, n),
			insertions: r,
			advanceDeltaPx: u.get(t) - l.get(t)
		});
	}
	if (p.size === 0) return null;
	let m = [...p.values()].reduce((e, t) => e + t.advanceDeltaPx, 0);
	return {
		perSeg: p,
		appliedPx: m,
		residualPx: t - m
	};
}
//#endregion
//#region packages/docx/src/layout/shape-drawing-plan.ts
var cg = 1;
function lg(e) {
	return Object.freeze({
		status: "unsupported",
		command: Object.freeze({ kind: "noop" }),
		diagnostics: Object.freeze([Object.freeze({
			code: "UNSUPPORTED_FEATURE",
			severity: "error",
			message: e
		})])
	});
}
function ug(e) {
	return e ? {
		type: e.type,
		w: e.w,
		len: e.len
	} : void 0;
}
function dg(e) {
	return !e.stroke || !e.strokeWidth || e.strokeWidth <= 0 ? null : {
		color: e.stroke,
		width: e.strokeWidth,
		...e.strokeDash ? { dashStyle: e.strokeDash } : {},
		...e.strokeCap ? { lineCap: e.strokeCap } : {},
		...ug(e.headEnd) ? { headEnd: ug(e.headEnd) } : {},
		...ug(e.tailEnd) ? { tailEnd: ug(e.tailEnd) } : {}
	};
}
function fg(e, t, n, r) {
	let i = r !== void 0 && (r.textPathOk !== void 0 || r.on !== void 0 || r.fitShape !== void 0 || r.fitPath !== void 0 || r.trim !== void 0 || r.xScale !== void 0);
	if (r !== void 0 && (!i || r.textPathOk === !0 && r.on === !0)) {
		if (r.fitPath === !0) return lg("VML textPath fitPath=true is not rendered");
		if (r.xScale === !0) return lg("VML textPath xScale=true is not rendered");
		if (r.string.trim().length === 0) return Object.freeze({
			status: "planned",
			command: Object.freeze({ kind: "noop" })
		});
		if (!n) throw Error("Shape textPath acquisition requires TextLayoutService");
		let a = i ? r.fitShape === !0 : !0;
		if (r.fontSizePt !== void 0 && (!Number.isFinite(r.fontSizePt) || r.fontSizePt < 0)) throw RangeError("VML textPath fontSizePt must be finite and non-negative");
		if (!a && r.fontSizePt === void 0) return lg("VML textPath fitShape=false requires an authored font-size");
		if (r.fontSizePt === 0) return Object.freeze({
			status: "planned",
			command: Object.freeze({ kind: "noop" })
		});
		let o = r.fontSizePt ?? cg, s = r.fontFamily ?? void 0, c = n.shape({
			text: r.string,
			fontSizePt: o,
			fonts: {
				ascii: s,
				highAnsi: s,
				eastAsia: s,
				complexScript: s
			},
			weight: r.bold ? 700 : 400,
			style: r.italic ? "italic" : "normal",
			measure: !0
		});
		if (r.trim === !0 && !c.inkBounds) return lg("VML textPath trim=true requires glyph ink bounds");
		let l = r.trim === !0 ? c.inkBounds?.xMinPt ?? 0 : 0, u = r.trim === !0 ? c.inkBounds?.xMaxPt ?? 0 : c.advancePt, d = r.trim === !0 ? c.inkBounds?.ascentPt ?? 0 : c.ascentPt, f = r.trim === !0 ? c.inkBounds?.descentPt ?? 0 : c.descentPt, p = {
			xPt: l,
			yPt: -d,
			widthPt: u - l,
			heightPt: d + f
		};
		if (!Number.isFinite(c.advancePt) || Object.values(p).some((e) => !Number.isFinite(e)) || c.spans.some((e) => !Number.isFinite(e.advancePt))) throw Error("Shape textPath acquisition produced non-finite metrics");
		return p.widthPt <= 0 || p.heightPt <= 0 || c.spans.length === 0 ? lg("VML textPath produced empty glyph metrics") : Object.freeze({
			status: "planned",
			command: H({
				kind: "watermark-text",
				rect: { ...t },
				text: r.string,
				fill: e.fill ? {
					...e.fill,
					...e.fill.fillType === "gradient" ? { stops: e.fill.stops.map((e) => ({ ...e })) } : {}
				} : null,
				opacity: Math.max(0, Math.min(1, e.fillOpacity ?? 1)),
				rotationDeg: e.rotation ?? 0,
				fitShape: a,
				fontSizePt: o,
				sourceBounds: p,
				spans: c.spans.map((e) => ({
					text: e.text,
					advancePt: e.advancePt,
					fontRoute: e.fontRoute,
					fontWeight: e.font.weight,
					fontStyle: e.font.style
				}))
			}, "VML textPath command")
		});
	}
	let a = {
		rect: {
			x: t.xPt,
			y: t.yPt,
			w: t.widthPt,
			h: t.heightPt
		},
		geometry: e.presetGeometry ? {
			kind: "preset",
			name: e.presetGeometry,
			adjustments: [...e.adjValues ?? []]
		} : {
			kind: "custom",
			subpaths: e.subpaths.map((e) => e.map((e) => ({ ...e })))
		},
		fill: e.fill ? {
			...e.fill,
			...e.fill.fillType === "gradient" ? { stops: e.fill.stops.map((e) => ({ ...e })) } : {}
		} : null,
		stroke: dg(e),
		transform: {
			rotationDeg: e.rotation ?? 0,
			flipH: e.flipH ?? !1,
			flipV: e.flipV ?? !1
		}
	};
	return Object.freeze({
		status: "planned",
		command: H({
			kind: "drawingml-shape",
			plan: a
		}, "DrawingML shape command")
	});
}
//#endregion
//#region packages/docx/src/layout/retained-typography.ts
function pg(e) {
	if (!Number.isFinite(e.advancePt) || e.advancePt <= 0) throw RangeError("Tab leader glyph advance must be finite and positive");
	let t = Math.floor(e.interval.widthPt / e.advancePt), n = e.interval.widthPt - t * e.advancePt;
	return Array.from({ length: t }, (t, r) => ({
		text: e.glyph,
		origin: {
			xPt: e.interval.xPt + n / 2 + r * e.advancePt,
			yPt: e.baselinePt
		},
		fontRoute: e.fontRoute,
		fontSizePt: e.fontSizePt,
		fontWeight: e.fontWeight,
		fontStyle: e.fontStyle,
		color: e.color
	}));
}
function mg(e) {
	let t;
	if (e.raisePt !== void 0) t = e.baseOrigin.yPt - e.raisePt;
	else if (e.baseInkTopPt !== void 0 && e.guideInkBottomFromBaselinePt !== void 0) t = e.baseInkTopPt - e.guideInkBottomFromBaselinePt;
	else throw Error("Ruby geometry requires authored w:hpsRaise or retained base/guide ink bounds");
	let n = e.baseOrigin.xPt + (e.baseAdvancePt - e.guideAdvancePt) / 2;
	return e.spans.map((e) => ({
		text: e.text,
		origin: {
			xPt: n + e.offsetPt,
			yPt: t
		},
		fontRoute: e.fontRoute,
		fontSizePt: e.fontSizePt,
		fontWeight: e.fontWeight,
		fontStyle: e.fontStyle,
		color: e.color
	}));
}
function hg(e) {
	return -(e.inkBounds?.ascentPt ?? e.ascentPt);
}
function gg(e) {
	return e.inkBounds?.descentPt ?? e.descentPt;
}
function _g(e) {
	let t = e.inkBounds ? e.inkBounds.ascentPt + e.inkBounds.descentPt : Math.min(e.ascentPt, e.descentPt);
	if (!Number.isFinite(t) || t <= 0) throw Error("Retained decoration probe requires positive selected-face ink");
	return t;
}
function vg(e) {
	return e === "double" || e === "dbl" ? "double" : e?.includes("dot") ? "dotted" : e?.includes("dash") ? "dashed" : e?.includes("wave") ? "wavy" : "solid";
}
function yg(e, t, n) {
	let r = Math.max(0, t.xPt - e.xPt), i = n * 2, a = Math.max(1, Math.ceil(r / i));
	return Array.from({ length: a + 1 }, (t, i) => ({
		xPt: e.xPt + r * i / a,
		yPt: e.yPt + (i % 2 == 0 ? -n / 2 : n / 2)
	}));
}
function bg(e) {
	let t = [], n = e.origin.xPt + e.advancePt;
	if (e.underline) {
		let r = _g(e.underline.probe), i = e.origin.yPt + (hg(e.underline.probe) + gg(e.underline.probe)) / 2, a = e.origin.yPt + gg(e.base) + r / 2, o = Math.max(i, a), s = vg(e.underline.authoredStyle), c = {
			kind: "underline",
			...e.underline.authoredStyle === void 0 ? {} : { authoredStyle: e.underline.authoredStyle },
			color: e.underline.color,
			widthPt: r
		};
		if (s === "double") {
			let i = o + r * 2;
			t.push({
				...c,
				style: "solid",
				from: {
					xPt: e.origin.xPt,
					yPt: o
				},
				to: {
					xPt: n,
					yPt: o
				}
			}, {
				...c,
				style: "solid",
				from: {
					xPt: e.origin.xPt,
					yPt: i
				},
				to: {
					xPt: n,
					yPt: i
				}
			});
		} else {
			let i = {
				xPt: e.origin.xPt,
				yPt: o
			}, a = {
				xPt: n,
				yPt: o
			};
			t.push({
				...c,
				style: s,
				from: i,
				to: a,
				...s === "wavy" ? { path: yg(i, a, r) } : {},
				...s === "dotted" ? { dashPatternPt: [r, r * 2] } : {},
				...s === "dashed" ? { dashPatternPt: [r * 4, r * 3] } : {}
			});
		}
	}
	if (e.strike) {
		let r = _g(e.strike.probe);
		if (e.strike.double && e.strike.doubleProbe) {
			let i = e.origin.yPt + hg(e.strike.doubleProbe) + r / 2, a = e.origin.yPt + gg(e.strike.doubleProbe) - r / 2;
			for (let o of [i, a]) t.push({
				kind: "strikethrough",
				color: e.color,
				widthPt: r,
				style: "solid",
				from: {
					xPt: e.origin.xPt,
					yPt: o
				},
				to: {
					xPt: n,
					yPt: o
				}
			});
		} else {
			let i = e.origin.yPt + (hg(e.strike.probe) + gg(e.strike.probe)) / 2;
			t.push({
				kind: "strikethrough",
				color: e.color,
				widthPt: r,
				style: "solid",
				from: {
					xPt: e.origin.xPt,
					yPt: i
				},
				to: {
					xPt: n,
					yPt: i
				}
			});
		}
	}
	return t;
}
function xg(e) {
	let t = e.mark.inkBounds.xMaxPt - e.mark.inkBounds.xMinPt, n = e.mark.inkBounds.ascentPt + e.mark.inkBounds.descentPt;
	if (!(t > 0) || !(n > 0)) throw Error("Retained emphasis glyph requires positive selected-face ink bounds");
	let r = [];
	for (let t of e.clusterInk) {
		if (/^\s+$/u.test(t.text)) continue;
		let n = e.clusters.find((e) => e.range.start === t.range.start && e.range.end === t.range.end);
		if (!n) throw Error("Retained emphasis cluster ink does not match shaped cluster geometry");
		let i = (e.origin.xPt + n.offset.xPt + t.ink.xMinPt * e.scaleX + (e.origin.xPt + n.offset.xPt + t.ink.xMaxPt * e.scaleX)) / 2 - (e.mark.inkBounds.xMinPt + e.mark.inkBounds.xMaxPt) / 2, a = e.authored === "underDot" ? e.origin.yPt + t.ink.descentPt + e.mark.inkBounds.ascentPt : e.origin.yPt - t.ink.ascentPt - e.mark.inkBounds.descentPt;
		r.push({
			text: e.glyph,
			origin: {
				xPt: i,
				yPt: a
			},
			fontRoute: e.mark.fontRoute,
			fontSizePt: e.mark.fontSizePt,
			fontWeight: e.mark.fontWeight,
			fontStyle: e.mark.fontStyle,
			color: e.mark.color,
			inkBounds: e.mark.inkBounds
		});
	}
	return r;
}
function Sg(e, t) {
	return e.val === t.val && e.color === t.color && e.widthPt === t.widthPt && e.spacePt === t.spacePt && e.themeColor === t.themeColor && e.themeTint === t.themeTint && e.themeShade === t.themeShade && e.shadow === t.shadow && e.frame === t.frame;
}
function Cg(e) {
	let t = [], n = 0;
	for (; n < e.length;) {
		let r = e[n], i = n + 1, a = r.bounds.xPt + r.bounds.widthPt + r.trailingSlackPt;
		for (; i < e.length;) {
			let t = e[i];
			if (!Sg(r.border, t.border) || Math.abs(t.bounds.xPt - a) > 1e-6 || t.bounds.yPt !== r.bounds.yPt || t.bounds.heightPt !== r.bounds.heightPt) break;
			a = t.bounds.xPt + t.bounds.widthPt + t.trailingSlackPt, i += 1;
		}
		let o = r.bounds.xPt - r.border.spacePt, s = r.bounds.yPt - r.border.spacePt, c = a + r.border.spacePt, l = r.bounds.yPt + r.bounds.heightPt + r.border.spacePt, u = {
			color: r.border.color,
			widthPt: r.border.widthPt,
			...Bd(r.border.val, r.border.widthPt)
		};
		t.push({
			...u,
			edge: "top",
			from: {
				xPt: o,
				yPt: s
			},
			to: {
				xPt: c,
				yPt: s
			}
		}, {
			...u,
			edge: "right",
			from: {
				xPt: c,
				yPt: s
			},
			to: {
				xPt: c,
				yPt: l
			}
		}, {
			...u,
			edge: "bottom",
			from: {
				xPt: o,
				yPt: l
			},
			to: {
				xPt: c,
				yPt: l
			}
		}, {
			...u,
			edge: "left",
			from: {
				xPt: o,
				yPt: s
			},
			to: {
				xPt: o,
				yPt: l
			}
		}), n = i;
	}
	return t;
}
//#endregion
//#region packages/docx/src/layout/anchor-compatibility.ts
var wg = K({
	id: "word-zero-relative-size",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/layout/anchor-frame.test.ts#uses wp:extent when Word does not support an exact-zero relative size"
	},
	description: "Word 2010 accepts only positive wp14:pctWidth and wp14:pctHeight values under [MS-ODRAWXML] notes 125/126. Preserve an authored zero as acquisition evidence while resolving the object from wp:extent."
});
K({
	id: "word-vertical-section-physical-drawing-layer",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/anchor-vertical-physical.test.ts#lands an upright-section anchor at the recorded physical centroid"
	},
	description: "Resolve anchored drawings in an upright vertical section against the physical page frame independently of the rotated text-flow coordinate space."
}), K({
	id: "word-page-level-float-prescan",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/page-anchor-prescan.test.ts#pre-scan REGISTERS a page-level (relativeFrom=\"margin\") wrap float on an earlier-scanned paragraph"
	},
	description: "A wrapping drawing whose vertical reference is page-level participates from page start so source-earlier paragraphs on that page see its exclusion."
}), K({
	id: "word-paragraph-anchor-pre-spacing-origin",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/anchor-paragraph-spacebefore.test.ts#anchors a wrapSquare paragraph float at the pre-spaceBefore paragraph top"
	},
	description: "Resolve a paragraph-relative anchored drawing from the paragraph top before applying the paragraph spaceBefore contribution."
}), K({
	id: "word-vertical-section-physical-header-footer",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/vertical-header-footer.test.ts#recovers the physical page box + margins from the logical (swapped) section"
	},
	description: "Paint a vertical section header and footer in the unrotated physical page frame rather than rotating them with the body text flow."
}), K({
	id: "word-frame-auto-wrap-around",
	evidence: {
		kind: "regression-test",
		reference: "packages/docx/src/frame-geometry.test.ts#wrap=\"around\" and \"auto\" → square float (auto ≡ around in Word)"
	},
	description: "Resolve an authored frame wrap value of auto through the same square side-wrap path as around."
}), K({
	id: "word-lower-layer-same-paragraph-anchor-composition",
	evidence: {
		kind: "office-observation",
		syntheticFixtureId: "lower-layer-same-paragraph-anchor-composition",
		application: "Microsoft Word",
		version: "16.111.1",
		platform: "macOS 26.5.2"
	},
	description: "Word preserves a source-later, lower-z, page-owned drawing at its authored position when it belongs to the same anchor paragraph as already composed higher layers. This is a Word-observed compatibility override to ECMA-376 §20.4.2.3, not a normative OOXML rule."
}), K({
	id: "word-textbox-visible-anchor-extent",
	evidence: {
		kind: "office-observation",
		syntheticFixtureId: "textbox-visible-anchor-extent",
		application: "Microsoft Word",
		version: "16.111.1",
		platform: "macOS 26.5.2"
	},
	description: "For DrawingML middle and bottom text anchoring, derive the positioned extent through the last visible retained block while preserving structural trailing empty paragraphs and terminal paragraph spacing in the complete story."
});
function Tg(e) {
	return e.shading || e.borders.length > 0 || e.resources.length > 0 || e.drawings.length > 0 || e.textBoxes.length > 0 || e.lineNumbers?.some((e) => e.paintOps.length > 0) ? !0 : e.lines.some((e) => e.placements.some((e) => e.kind === "text" || e.kind === "resource" || e.kind === "drawing" ? !0 : e.kind === "tab" && (e.leaderGlyphs?.length ?? 0) > 0));
}
function Eg(e) {
	let t = e.flowBounds.yPt, n;
	for (let r of e.blocks) {
		if (r.kind === "table") {
			n = Math.max(n ?? t, r.flowBounds.yPt + r.advancePt);
			continue;
		}
		r.kind !== "paragraph" || !Tg(r) || (n = Math.max(n ?? t, r.flowBounds.yPt + Math.max(0, r.advancePt - r.spacing.afterPt)));
	}
	return n === void 0 ? 0 : Math.max(0, n - t);
}
function Dg(e) {
	return e === 0;
}
function Og(e, t) {
	return e == null ? !t : e !== "paragraph" && e !== "line" && e !== "character";
}
function kg(e, t, n) {
	return e === "page" && t !== null && n !== void 0 && t < n;
}
//#endregion
//#region packages/docx/src/layout/anchor-frame.ts
var Ag = 21600;
function Q(e, t, n) {
	return {
		code: e,
		path: t,
		message: n
	};
}
function jg(e) {
	return typeof e == "number" && Number.isFinite(e);
}
function Mg(e) {
	return jg(e.xPt) && jg(e.yPt) && jg(e.widthPt) && jg(e.heightPt) && e.widthPt >= 0 && e.heightPt >= 0;
}
function Ng(e) {
	return e.kind === "align" ? e.value : e.kind === "offset" ? e.valuePt : e.kind === "percent" ? e.fraction : null;
}
function $(e, t, n, r = !1) {
	let i = t[e];
	return {
		axis: e,
		status: "unsupported",
		relativeFrom: r ? "page" : i.relativeFrom,
		choiceKind: r ? "simple-position" : i.choice.kind,
		choiceValue: r ? e === "horizontal" ? t.simplePosition.xPt : t.simplePosition.yPt : Ng(i.choice),
		issueCode: n.code
	};
}
function Pg(e, t, n, r) {
	let i = n[e];
	return i === null ? { problem: Q("missing-reference-frame", r, `${e} frame is required`) } : Mg(i) ? { base: {
		startPt: t === "horizontal" ? i.xPt : i.yPt,
		endPt: t === "horizontal" ? i.xPt + i.widthPt : i.yPt + i.heightPt,
		referenceFrame: e
	} } : { problem: Q("invalid-reference-frame", r, `${e} frame must be finite and non-negative`) };
}
function Fg(e, t, n, r) {
	let i = Pg("page", t, n, r);
	if (!i.base) return i;
	let a = Pg("margin", t, n, r);
	if (!a.base) return a;
	let o = n.page, s = n.margin, c = e === "leftMargin" || e === "rightMargin";
	if (c !== (t === "horizontal")) return { problem: Q("unsupported-relative-from", r, `${e} is not valid for the ${t} axis`) };
	let l = c ? o.xPt : o.yPt, u = c ? o.xPt + o.widthPt : o.yPt + o.heightPt, d = c ? s.xPt : s.yPt, f = c ? s.xPt + s.widthPt : s.yPt + s.heightPt;
	if (d < l || f > u) return { problem: Q("invalid-reference-frame", r, "margin frame must be contained by the page frame") };
	let p = e === "leftMargin" || e === "topMargin";
	return { base: {
		startPt: p ? l : f,
		endPt: p ? d : u,
		referenceFrame: e
	} };
}
function Ig(e, t, n, r) {
	if (t === "page" || t === "margin" || e === "horizontal" && (t === "column" || t === "character") || e === "vertical" && (t === "paragraph" || t === "line")) return Pg(t, e, n, r);
	if (e === "horizontal" && (t === "leftMargin" || t === "rightMargin") || e === "vertical" && (t === "topMargin" || t === "bottomMargin")) return Fg(t, e, n, r);
	if (t === "insideMargin" || t === "outsideMargin") {
		if (n.pageParity === null) return { problem: Q("missing-page-parity", r, `${t} requires explicit page parity`) };
		let i = t === "insideMargin" == (n.pageParity === "odd");
		return {
			...Fg(e === "horizontal" ? i ? "leftMargin" : "rightMargin" : i ? "topMargin" : "bottomMargin", e, n, r),
			parityRequired: !0
		};
	}
	return { problem: Q("unsupported-relative-from", r, `${t} is not a valid ${e} reference`) };
}
function Lg(e, t, n) {
	let r = t.relativeSize[e], i = e === "horizontal" ? "width" : "height", a = (n = null) => {
		let r = e === "horizontal" ? t.extent.widthStatus : t.extent.heightStatus, a = e === "horizontal" ? t.extent.widthPt : t.extent.heightPt;
		return r === "missing" ? { problem: Q("missing-size", `extent.${i}`, `${i} is required`) } : r !== "valid" || !jg(a) || a <= 0 ? { problem: Q("invalid-size", `extent.${i}`, `${i} extent must be finite and positive`) } : { resolved: {
			valuePt: a,
			diagnostic: {
				source: "extent",
				valuePt: a,
				relativeFrom: n?.relativeFrom ?? null,
				referenceFrame: null,
				fraction: n?.fraction ?? null,
				...n === null ? {} : { compatibilityFallback: wg.id }
			}
		} };
	};
	if (r === null) return a();
	let o = `relativeSize.${e}`;
	if (r.fractionStatus === "missing" || r.fraction === null) return { problem: Q("missing-relative-size-fraction", `${o}.fraction`, "relative size fraction is required") };
	if (r.fractionStatus !== "valid" || !jg(r.fraction)) return { problem: Q("invalid-relative-size-fraction", `${o}.fraction`, "relative size fraction must be finite") };
	if (r.fraction < 0) return { problem: Q("invalid-relative-size-fraction", `${o}.fraction`, "relative size fraction must be non-negative") };
	if (Dg(r.fraction)) return a({
		relativeFrom: r.relativeFrom,
		fraction: r.fraction
	});
	if (r.relativeFromStatus === "missing" || r.relativeFrom === null) return { problem: Q("missing-relative-size-reference", `${o}.relativeFrom`, "relative size reference is required") };
	if (r.relativeFromStatus !== "valid") return { problem: Q("invalid-relative-size-reference", `${o}.relativeFrom`, "relative size reference is invalid") };
	let s = Ig(e, r.relativeFrom, n, `${o}.relativeFrom`);
	if (!s.base) return { problem: Q(s.problem?.code === "missing-reference-frame" ? "missing-relative-size-reference" : "invalid-relative-size-reference", `${o}.relativeFrom`, s.problem?.message ?? "relative size reference cannot be resolved") };
	let c = (s.base.endPt - s.base.startPt) * r.fraction;
	return !jg(c) || c < 0 ? { problem: Q("invalid-relative-size-fraction", `${o}.fraction`, "relative size result must be finite and non-negative") } : { resolved: {
		valuePt: c,
		diagnostic: {
			source: "relative",
			valuePt: c,
			relativeFrom: r.relativeFrom,
			referenceFrame: s.base.referenceFrame,
			fraction: r.fraction
		}
	} };
}
function Rg(e, t, n, r) {
	let i = n[e], a = e;
	if (i.relativeFromStatus === "missing" || i.relativeFrom === null) {
		let t = Q("missing-relative-from", `${a}.relativeFrom`, `${e} relativeFrom is required`);
		return {
			diagnostic: $(e, n, t),
			problem: t
		};
	}
	if (i.relativeFromStatus !== "valid") {
		let t = Q("invalid-relative-from", `${a}.relativeFrom`, `${e} relativeFrom is invalid`);
		return {
			diagnostic: $(e, n, t),
			problem: t
		};
	}
	let o = Ig(e, i.relativeFrom, r, `${a}.relativeFrom`);
	if (!o.base) {
		let t = o.problem;
		return {
			diagnostic: $(e, n, t),
			problem: t
		};
	}
	let s = i.choice;
	if (s.kind === "missing") {
		let t = Q("missing-axis-choice", `${a}.choice`, `${e} choice is required`);
		return {
			diagnostic: $(e, n, t),
			problem: t
		};
	}
	if (s.kind === "invalid") {
		let t = Q("invalid-axis-choice", `${a}.choice`, `${e} choice is invalid`);
		return {
			diagnostic: $(e, n, t),
			problem: t
		};
	}
	let c = o.base.endPt - o.base.startPt, l, u;
	if (s.kind === "offset") {
		if (!jg(s.valuePt)) {
			let t = Q("invalid-axis-value", `${a}.choice`, "offset must be finite");
			return {
				diagnostic: $(e, n, t),
				problem: t
			};
		}
		l = o.base.startPt + s.valuePt, u = s.valuePt;
	} else if (s.kind === "percent") {
		if (!jg(s.fraction)) {
			let t = Q("invalid-axis-value", `${a}.choice`, "percentage must be finite");
			return {
				diagnostic: $(e, n, t),
				problem: t
			};
		}
		l = o.base.startPt + c * s.fraction, u = s.fraction;
	} else if (s.kind === "align") {
		if (!(e === "horizontal" ? [
			"left",
			"center",
			"right",
			"inside",
			"outside"
		].includes(s.value) : [
			"top",
			"center",
			"bottom",
			"inside",
			"outside"
		].includes(s.value))) {
			let t = Q("invalid-axis-value", `${a}.choice`, `${s.value} is invalid`);
			return {
				diagnostic: $(e, n, t),
				problem: t
			};
		}
		if ((s.value === "inside" || s.value === "outside") && r.pageParity === null) {
			let t = Q("missing-page-parity", "frames.pageParity", `${s.value} alignment requires explicit page parity`);
			return {
				diagnostic: $(e, n, t),
				problem: t
			};
		}
		let i = e === "horizontal" ? "left" : "top", d = e === "horizontal" ? "right" : "bottom", f = s.value === "inside", p = r.pageParity === "odd", m = s.value === i || f && p || s.value === "outside" && !p, h = s.value === d || f && !p || s.value === "outside" && p;
		l = m ? o.base.startPt : h ? o.base.endPt - t : o.base.startPt + (c - t) / 2, u = s.value;
	} else {
		let t = Q("invalid-axis-choice", `${a}.choice`, `${e} choice is invalid`);
		return {
			diagnostic: $(e, n, t),
			problem: t
		};
	}
	if (!jg(l)) {
		let t = Q("invalid-axis-value", `${a}.choice`, "resolved origin is not finite");
		return {
			diagnostic: $(e, n, t),
			problem: t
		};
	}
	return {
		valuePt: l,
		diagnostic: {
			axis: e,
			status: "resolved",
			relativeFrom: i.relativeFrom,
			referenceFrame: o.base.referenceFrame,
			choiceKind: s.kind,
			choiceValue: u,
			baseStartPt: o.base.startPt,
			baseEndPt: o.base.endPt,
			resolvedOriginPt: l,
			pageParity: s.kind === "align" && (s.value === "inside" || s.value === "outside") ? r.pageParity : null
		}
	};
}
function zg(e, t, n) {
	let r = e === "horizontal" ? n.xPt : n.yPt, i = e === "horizontal" ? n.xPt + n.widthPt : n.yPt + n.heightPt, a = r + t;
	return {
		valuePt: a,
		diagnostic: {
			axis: e,
			status: "resolved",
			relativeFrom: "page",
			referenceFrame: "page",
			choiceKind: "simple-position",
			choiceValue: t,
			baseStartPt: r,
			baseEndPt: i,
			resolvedOriginPt: a,
			pageParity: null
		}
	};
}
var Bg = [
	"top",
	"right",
	"bottom",
	"left"
];
function Vg(e, t) {
	return e[`${t}Status`];
}
function Hg(e, t) {
	return e[`${t}Pt`];
}
function Ug(e, t, n) {
	let r = Bg.some((t) => Vg(e, t) !== "missing");
	if (!n && !r) return { values: {
		topPt: 0,
		rightPt: 0,
		bottomPt: 0,
		leftPt: 0
	} };
	let i = {
		topPt: 0,
		rightPt: 0,
		bottomPt: 0,
		leftPt: 0
	};
	for (let n of Bg) {
		let r = Vg(e, n), a = Hg(e, n);
		if (r !== "valid" || !jg(a)) return { problem: Q("invalid-effect-extent", `${t}.${n}`, "present effectExtent requires four finite edge values") };
		i[`${n}Pt`] = a;
	}
	return { values: i };
}
function Wg(e, t) {
	let n = {
		topPt: 0,
		rightPt: 0,
		bottomPt: 0,
		leftPt: 0
	}, r = {};
	for (let i of Bg) {
		let a = Vg(t, i), o = Vg(e, i), s = a === "valid" || a === "invalid" ? {
			status: a,
			value: Hg(t, i),
			source: "wrap"
		} : o === "valid" || o === "invalid" ? {
			status: o,
			value: Hg(e, i),
			source: "anchor"
		} : {
			status: "missing",
			value: null,
			source: "implicit-zero"
		};
		if (s.status === "invalid" || s.status === "valid" && (!jg(s.value) || s.value < 0)) return { problem: Q("invalid-distance", `${s.source === "wrap" ? "wrap.distances" : "anchorDistances"}.${i}`, "wrap distance must be finite and non-negative") };
		n[`${i}Pt`] = s.status === "missing" ? 0 : s.value, r[i] = s.source;
	}
	return { resolved: {
		values: n,
		sources: r
	} };
}
function Gg(e, t) {
	let n = {
		xPt: e.xPt - t.leftPt,
		yPt: e.yPt - t.topPt,
		widthPt: e.widthPt + t.leftPt + t.rightPt,
		heightPt: e.heightPt + t.topPt + t.bottomPt
	};
	return Mg(n) ? n : null;
}
function Kg(e, t) {
	let n = e.wrap.polygon;
	if (n === null || n.invalidPointCount !== 0 || n.coordinateSpace.width !== Ag || n.coordinateSpace.height !== Ag || n.points.length < 3) return { problem: Q("invalid-wrap-polygon", "wrap.polygon", "tight and through wrapping require a valid fixed 21600 by 21600 polygon") };
	let r = [];
	for (let [e, i] of n.points.entries()) {
		if (!jg(i.x) || !jg(i.y)) return { problem: Q("invalid-wrap-polygon", `wrap.polygon.points.${e}`, "polygon coordinates must be finite") };
		r.push({
			xPt: t.xPt + i.x / Ag * t.widthPt,
			yPt: t.yPt + i.y / Ag * t.heightPt
		});
	}
	let i = r.map((e) => e.xPt), a = r.map((e) => e.yPt), o = Math.min(...i), s = Math.max(...i), c = Math.min(...a), l = Math.max(...a);
	return {
		polygon: {
			edited: n.edited,
			points: r
		},
		bounds: {
			xPt: o,
			yPt: c,
			widthPt: s - o,
			heightPt: l - c
		}
	};
}
function qg(e) {
	return {
		coordinateSpace: "anchor-frame",
		groupApplication: "parser-resolved-child-frame",
		group: e === null ? null : {
			childSourceId: e.childSourceId,
			sourceIndex: e.sourceIndex,
			sourceCount: e.sourceCount,
			transformChain: e.transformChain.map((e) => ({ ...e })),
			childTransform: e.childTransform === null ? null : { ...e.childTransform },
			resolvedChildFrame: { ...e.resolvedChildFrame }
		}
	};
}
function Jg(e) {
	return H(e, "anchor frame result");
}
function Yg(e) {
	let { acquisition: t, frames: n } = e;
	for (let e of [
		"relativeHeight",
		"behindDoc",
		"locked",
		"layoutInCell",
		"allowOverlap"
	]) {
		let n = t.behavior[`${e}Status`], r = t.behavior[e];
		if (n === "valid" && r !== null) continue;
		let i = Q(n === "missing" ? "missing-required-behavior" : "invalid-required-behavior", `behavior.${e}`, `CT_Anchor requires a ${e} value`);
		return Jg({
			status: "unsupported",
			occurrenceId: t.occurrenceId,
			axes: {
				horizontal: $("horizontal", t, i),
				vertical: $("vertical", t, i)
			},
			issues: [i]
		});
	}
	let r = [], i = Lg("horizontal", t, n), a = Lg("vertical", t, n);
	i.problem && r.push(i.problem), a.problem && r.push(a.problem);
	let o, s, c = i.problem ?? a.problem;
	if (c || !i.resolved || !a.resolved) {
		let e = c;
		o = { diagnostic: $("horizontal", t, e) }, s = { diagnostic: $("vertical", t, e) };
	} else if (t.simplePosition.status === "invalid") {
		let e = Q("invalid-simple-position", "simplePosition.enabled", "simplePos enablement is invalid");
		r.push(e), o = {
			diagnostic: $("horizontal", t, e, !0),
			problem: e
		}, s = {
			diagnostic: $("vertical", t, e, !0),
			problem: e
		};
	} else if (t.simplePosition.status === "valid" && t.simplePosition.enabled === !0) {
		let e = Pg("page", "horizontal", n, "frames.page"), i = t.simplePosition.xPt, a = t.simplePosition.yPt;
		if (!e.base || n.page === null || !Mg(n.page)) {
			let n = e.problem ?? Q("invalid-reference-frame", "frames.page", "simple positioning requires a valid page frame");
			r.push(n), o = {
				diagnostic: $("horizontal", t, n, !0),
				problem: n
			}, s = {
				diagnostic: $("vertical", t, n, !0),
				problem: n
			};
		} else if (t.simplePosition.xStatus !== "valid" || !jg(i)) {
			let e = t.simplePosition.xStatus === "invalid", n = Q(e ? "invalid-simple-position" : "missing-simple-coordinate", "simplePosition.x", e ? "simple position x is lexically invalid" : "simple position x is required");
			r.push(n), o = {
				diagnostic: $("horizontal", t, n, !0),
				problem: n
			}, s = {
				diagnostic: $("vertical", t, n, !0),
				problem: n
			};
		} else if (t.simplePosition.yStatus !== "valid" || !jg(a)) {
			let e = t.simplePosition.yStatus === "invalid", n = Q(e ? "invalid-simple-position" : "missing-simple-coordinate", "simplePosition.y", e ? "simple position y is lexically invalid" : "simple position y is required");
			r.push(n), o = {
				diagnostic: $("horizontal", t, n, !0),
				problem: n
			}, s = {
				diagnostic: $("vertical", t, n, !0),
				problem: n
			};
		} else o = zg("horizontal", i, n.page), s = zg("vertical", a, n.page);
	} else {
		let e = Rg("horizontal", i.resolved.valuePt, t, n), c = Rg("vertical", a.resolved.valuePt, t, n);
		o = {
			...e,
			diagnostic: e.diagnostic
		}, s = {
			...c,
			diagnostic: c.diagnostic
		}, e.problem && r.push(e.problem), c.problem && r.push(c.problem);
	}
	if (r.length > 0 || !i.resolved || !a.resolved || o.valuePt === void 0 || s.valuePt === void 0) return Jg({
		status: "unsupported",
		occurrenceId: t.occurrenceId,
		axes: {
			horizontal: o.diagnostic,
			vertical: s.diagnostic
		},
		issues: r
	});
	let l = {
		xPt: o.valuePt,
		yPt: s.valuePt,
		widthPt: i.resolved.valuePt,
		heightPt: a.resolved.valuePt
	}, u = Ug(t.parentEffectExtent, "parentEffectExtent", !1);
	if (u.problem || !u.values) {
		let e = u.problem;
		return Jg({
			status: "unsupported",
			occurrenceId: t.occurrenceId,
			axes: {
				horizontal: o.diagnostic,
				vertical: s.diagnostic
			},
			issues: [e]
		});
	}
	let d = Gg(l, u.values);
	if (d === null) {
		let e = Q("invalid-effect-extent", "parentEffectExtent", "parent effect extents produce invalid ink bounds");
		return Jg({
			status: "unsupported",
			occurrenceId: t.occurrenceId,
			axes: {
				horizontal: o.diagnostic,
				vertical: s.diagnostic
			},
			issues: [e]
		});
	}
	if (t.wrap.kind === "missing" || t.wrap.kind === "invalid") {
		let e = Q(t.wrap.kind === "missing" ? "missing-wrap-kind" : "invalid-wrap-kind", "wrap.kind", "exactly one valid wrap kind is required");
		return Jg({
			status: "unsupported",
			occurrenceId: t.occurrenceId,
			axes: {
				horizontal: o.diagnostic,
				vertical: s.diagnostic
			},
			issues: [e]
		});
	}
	let f = Wg(t.anchorDistances, t.wrap.distances);
	if (f.problem || !f.resolved) return Jg({
		status: "unsupported",
		occurrenceId: t.occurrenceId,
		axes: {
			horizontal: o.diagnostic,
			vertical: s.diagnostic
		},
		issues: [f.problem]
	});
	let p = t.wrap.kind === "square" || t.wrap.kind === "tight" || t.wrap.kind === "through", m = p && [
		"bothSides",
		"left",
		"right",
		"largest"
	].includes(t.wrap.side ?? "") ? t.wrap.side : null;
	if (p && m === null) {
		let e = Q("invalid-wrap-side", "wrap.side", "square, tight, and through wrapping require an authored wrap side");
		return Jg({
			status: "unsupported",
			occurrenceId: t.occurrenceId,
			axes: {
				horizontal: o.diagnostic,
				vertical: s.diagnostic
			},
			issues: [e]
		});
	}
	let h = u.values, g = Bg.some((e) => Vg(t.parentEffectExtent, e) !== "missing") ? "parent" : "none";
	if (t.wrap.effectExtent !== null) {
		let e = Ug(t.wrap.effectExtent, "wrap.effectExtent", !0);
		if (e.problem || !e.values) return Jg({
			status: "unsupported",
			occurrenceId: t.occurrenceId,
			axes: {
				horizontal: o.diagnostic,
				vertical: s.diagnostic
			},
			issues: [e.problem]
		});
		h = e.values, g = "wrap-child";
	}
	let _ = null, v = null, y = null;
	if (t.wrap.kind === "tight" || t.wrap.kind === "through") {
		let e = Kg(t, l);
		if (e.problem || !e.polygon || !e.bounds) return Jg({
			status: "unsupported",
			occurrenceId: t.occurrenceId,
			axes: {
				horizontal: o.diagnostic,
				vertical: s.diagnostic
			},
			issues: [e.problem]
		});
		_ = e.polygon, v = {
			width: 21600,
			height: 21600
		}, y = e.bounds, h = {
			topPt: 0,
			rightPt: 0,
			bottomPt: 0,
			leftPt: 0
		}, g = "none";
	} else if (t.wrap.kind !== "none" && (y = Gg(l, h), y === null)) {
		let e = Q("invalid-effect-extent", "wrap.effectExtent", "wrapping effect extents produce invalid bounds");
		return Jg({
			status: "unsupported",
			occurrenceId: t.occurrenceId,
			axes: {
				horizontal: o.diagnostic,
				vertical: s.diagnostic
			},
			issues: [e]
		});
	}
	let b = y === null ? null : Gg(y, f.resolved.values);
	if (y !== null && b === null) {
		let e = Q("invalid-distance", "wrap.distances", "distances produce invalid bounds");
		return Jg({
			status: "unsupported",
			occurrenceId: t.occurrenceId,
			axes: {
				horizontal: o.diagnostic,
				vertical: s.diagnostic
			},
			issues: [e]
		});
	}
	return Jg({
		status: "resolved",
		occurrenceId: t.occurrenceId,
		axes: {
			horizontal: o.diagnostic,
			vertical: s.diagnostic
		},
		issues: [],
		geometry: {
			objectFrame: l,
			inkBounds: d,
			wrapBounds: b,
			size: {
				horizontal: i.resolved.diagnostic,
				vertical: a.resolved.diagnostic
			},
			parentEffectExtent: u.values,
			wrap: {
				kind: t.wrap.kind,
				side: m,
				distances: f.resolved.values,
				distanceSources: f.resolved.sources,
				effectExtent: h,
				effectExtentSource: g,
				coordinateSpace: v,
				polygon: _
			},
			transform: qg(t.group)
		}
	});
}
//#endregion
//#region packages/docx/src/layout/paragraph-spacing.ts
function Xg(e, t, n, r) {
	if (!e) return r;
	let i = !!(e.styleId && e.styleId === t.styleId), a = !!(i && e.contextualSpacing), o = !!(i && t.contextualSpacing);
	return a && o ? 0 : o ? n : a ? Math.max(r - n, 0) : Math.max(n, r);
}
function Zg(e, t, n, r) {
	let i = Xg(e, t, n, r), a = i <= n;
	return {
		suppressBefore: a,
		overlap: n + (a ? 0 : r) - i
	};
}
//#endregion
//#region packages/docx/src/layout/pagination-fields.ts
function Qg(e) {
	return Object.freeze(e.pages.map((e) => Object.freeze({
		pageIndex: e.pageIndex,
		displayPageNumber: e.pageNumber.displayNumber,
		pageNumberFormat: e.pageNumber.format
	})));
}
function $g(e) {
	if (e.fieldType === "page") return "page";
	if (/numPages/i.test(e.fieldType) || /NUMPAGES/i.test(e.instruction)) return "total-pages";
}
function e_(e) {
	return e.some((e) => e.type === "paragraph" ? e.runs.some((e) => e.type === "field" ? $g(e) !== void 0 : !1) : e.type === "table" ? e.rows.some((e) => e.cells.some((e) => e_(e.content))) : !1);
}
function t_(e, t = [], n = []) {
	return e_(e) || t.some((e) => e_(e.content)) || n.some((e) => e_(e));
}
//#endregion
//#region packages/docx/src/layout/paragraph-wrap-registry.ts
var n_ = /* @__PURE__ */ new WeakMap(), r_ = "table-final-frame:";
function i_(e) {
	let t = new Set(e.drawings.flatMap((e) => {
		let t = e.anchorLayer?.acquisitionOccurrenceId ?? e.anchorLayer?.occurrenceId;
		return t === void 0 ? [] : [t];
	}));
	return Object.freeze({
		exclusions: Object.freeze(e.exclusions.filter((e) => !e.id.startsWith("table-final-frame:") && (e.anchorOccurrenceId === void 0 || !t.has(e.anchorOccurrenceId)))),
		collisions: Object.freeze((e.anchorCollisions ?? []).filter((e) => !t.has(e.occurrenceId)))
	});
}
function a_(e) {
	return new Set((e.anchorFrames ?? []).flatMap((e) => e.status === "resolved" ? [e.occurrenceId] : []));
}
function o_(e) {
	let t = a_(e), n = (e.anchorCollisions ?? []).filter((e) => t.has(e.occurrenceId)), r = new Set(n.map((e) => e.occurrenceId));
	for (let e of t) if (!r.has(e)) throw Error(`Paragraph anchor omitted collision geometry: ${e}`);
	return Object.freeze(n);
}
function s_(e) {
	let t = a_(e);
	return Object.freeze(e.exclusions.filter((e) => e.anchorOccurrenceId !== void 0 && t.has(e.anchorOccurrenceId)));
}
function c_(e) {
	return Object.freeze({
		flowDomainId: e,
		collisions: Object.freeze([]),
		exclusions: Object.freeze([])
	});
}
function l_(e, t) {
	let n = n_.get(e);
	n || (n = /* @__PURE__ */ new Map(), n_.set(e, n));
	let r = n.get(t);
	if (r) return r;
	let i = c_(t);
	return n.set(t, i), i;
}
function u_(e, t, n) {
	let r = n_.get(e);
	if (!r || r.get(t.flowDomainId) !== t) throw Error("Paragraph wrap registry transaction is stale");
	r.set(t.flowDomainId, d_(t, n));
}
function d_(e, t) {
	if (t.flowDomainId !== e.flowDomainId) throw Error("Paragraph wrap registry cannot cross flow domains");
	let n = new Set(e.collisions.map((e) => e.occurrenceId)), r = o_(t);
	for (let e of r) {
		if (n.has(e.occurrenceId)) throw Error(`Paragraph wrap occurrence committed twice: ${e.occurrenceId}`);
		n.add(e.occurrenceId);
	}
	let i = s_(t), a = new Set(r.map((e) => e.occurrenceId)), o = /* @__PURE__ */ new Set();
	for (let e of i) {
		let t = e.anchorOccurrenceId;
		if (t === void 0 || !a.has(t)) throw Error("Owned paragraph wrap exclusion omitted its collision occurrence");
		if (o.has(t)) throw Error(`Paragraph wrap occurrence produced duplicate exclusions: ${t}`);
		o.add(t);
	}
	return Object.freeze({
		flowDomainId: e.flowDomainId,
		collisions: Object.freeze([...e.collisions, ...r]),
		exclusions: Object.freeze([...e.exclusions, ...i])
	});
}
//#endregion
//#region packages/docx/src/layout/paragraph.ts
function f_(e, t) {
	if (!Number.isFinite(e) || e < 0) throw RangeError(`${t} must be finite and non-negative`);
	return e;
}
function p_(e) {
	if (!(!e || e.type !== "text" && e.type !== "field")) return e.typographyInput;
}
function m_(e) {
	switch (e) {
		case "left": return "left";
		case "right": return "right";
		default: return "center";
	}
}
function h_(e) {
	return f_(e.measuredWidthPt, "segment.measuredWidthPt");
}
function g_(e) {
	return e.map((e) => e.kind === "text" && !e.fixedPitch ? { text: e.text } : {});
}
function __(e) {
	return e === "lowKashida" ? "low" : e === "mediumKashida" ? "medium" : e === "highKashida" ? "high" : null;
}
function v_(e, t) {
	if (!e.textLayoutService || !e.textShapeRequest) throw Error("Kashida acquisition requires the retained TextLayoutService authority");
	let n = e.textLayoutService.shape({
		...e.textShapeRequest,
		text: t,
		measure: !0
	}), r = e.basePaintOps[0]?.scaleX ?? 1, i = e.basePaintOps[0]?.letterSpacingPt ?? 0;
	return n.advancePt * r + [...t].length * i;
}
function y_(e, t) {
	if (!e) return null;
	let n = Mh(e), r = /* @__PURE__ */ new Map(), i = 0;
	for (let [n, a] of e.perSeg) {
		let e = t[n], o = a.splitBefore;
		if (e?.kind === "text") {
			let t = new Set(e.clusters.slice(1).map((t) => t.range.start - e.range.start)), n = [...e.text], r = [0];
			for (let e of n) r.push((r.at(-1) ?? 0) + e.length);
			o = o.filter((e) => t.has(r[e] ?? -1));
		}
		let s = t[n + 1], c = a.trailingGap && !(s?.kind === "text" && s.breakBefore === !1);
		i += o.length + +!!c, r.set(n, {
			splitBefore: [...o],
			trailingGap: c,
			internalStretch: 0
		});
	}
	if (i === 0) return null;
	let a = n / i;
	for (let e of r.values()) e.internalStretch = e.splitBefore.length * a;
	return {
		perGap: a,
		perSeg: r
	};
}
function b_(e, t, n) {
	if (!t || t.splitBefore.length === 0) return {
		clusters: e.clusters,
		paintOps: e.basePaintOps
	};
	let r = [...e.text], i = [...t.splitBefore];
	if (i.some((e, t) => e <= 0 || e >= r.length || t > 0 && e <= (i[t - 1] ?? 0))) throw Error("Internal paragraph justification contains an invalid code-point cut");
	let a = [0];
	for (let e of r) a.push((a.at(-1) ?? 0) + e.length);
	let o = i.map((e) => a[e] ?? -1), s = new Set(e.clusters.map((t) => t.range.start - e.range.start));
	if (o.some((e) => !s.has(e))) throw Error("Internal paragraph justification must split at shaped cluster boundaries");
	let c = [
		0,
		...i,
		r.length
	], l = [];
	for (let t = 0; t < c.length - 1; t += 1) {
		let r = c[t] ?? 0, i = c[t + 1] ?? r, o = e.range.start + (a[r] ?? 0), s = e.clusters.find((e) => e.range.start === o);
		if (!s) throw Error("Internal paragraph justification is missing shaped cluster geometry");
		l.push({
			range: {
				start: o,
				end: e.range.start + (a[i] ?? 0)
			},
			offset: {
				xPt: s.offset.xPt + t * n,
				yPt: s.offset.yPt
			}
		});
	}
	let u = e.clusters.map((t) => {
		let r = t.range.start - e.range.start, i = o.filter((e) => e <= r).length;
		return {
			...t,
			offset: {
				...t.offset,
				xPt: t.offset.xPt + i * n
			}
		};
	});
	if (e.basePaintOps.length > 1) {
		let t = e.range.start;
		for (let n of e.basePaintOps) {
			if (n.range.start !== t || n.range.end <= n.range.start) throw Error("Internal paragraph justification has incomplete retained paint operations");
			t = n.range.end;
		}
		if (t !== e.range.end) throw Error("Internal paragraph justification has incomplete retained paint operations");
		let r = o.map((t) => e.range.start + t), i = [...new Set([
			e.range.start,
			e.range.end,
			...r,
			...e.basePaintOps.flatMap((e) => [e.range.start, e.range.end])
		])].sort((e, t) => e - t), a = [];
		for (let t = 0; t < i.length - 1; t += 1) {
			let o = i[t] ?? e.range.start, s = i[t + 1] ?? o, c = e.basePaintOps.find((e) => e.range.start <= o && e.range.end >= s);
			if (!c) throw Error("Internal paragraph justification lost a retained paint slice");
			let l = r.filter((e) => e <= o).length, d = u.find((e) => e.range.start === o);
			if (!d) throw Error("Internal paragraph justification is missing retained slice geometry");
			a.push({
				...c,
				text: c.text.slice(o - c.range.start, s - c.range.start),
				range: {
					start: o,
					end: s
				},
				offset: o === c.range.start ? {
					...c.offset,
					xPt: c.offset.xPt + l * n
				} : d.offset
			});
		}
		return {
			clusters: u,
			paintOps: a
		};
	}
	let d = e.basePaintOps.length === 1 ? e.basePaintOps[0] : void 0;
	if (!d) throw Error("Internal paragraph justification requires one contextual paint op");
	return i.length === r.length - 1 && i.every((e, t) => e === t + 1) ? {
		clusters: u,
		paintOps: [{
			...d,
			letterSpacingPt: d.letterSpacingPt + n
		}]
	} : {
		clusters: u,
		paintOps: l.map((t) => ({
			...d,
			text: e.text.slice(t.range.start - e.range.start, t.range.end - e.range.start),
			range: t.range,
			offset: t.offset
		}))
	};
}
function x_(e, t) {
	return e.flatMap((e) => {
		let n = e.text.trimEnd();
		if (n === "" || n.length === e.text.length) return [e];
		if (e.sourceMapping === "kashida") return [{
			...e,
			text: n
		}];
		let r = e.range.start + n.length, i = t.find((e) => e.range.start === r), { inkBounds: a, blockAxisInkBounds: o, ...s } = e;
		return [{
			...e,
			text: n,
			range: {
				...e.range,
				end: r
			}
		}, {
			...s,
			text: e.text.slice(n.length),
			range: {
				start: r,
				end: e.range.end
			},
			offset: i?.offset ?? e.offset
		}];
	});
}
function S_(e, t) {
	return e === void 0 || t === void 0 ? e === t : e.length === t.length && e.every((e, n) => e === t[n]);
}
function C_(e, t) {
	return e.kind === "underline" && e.kind === t.kind && e.authoredStyle === t.authoredStyle && e.style === t.style && e.color === t.color && e.widthPt === t.widthPt && e.to.xPt === t.from.xPt && S_(e.dashPatternPt, t.dashPatternPt);
}
function w_(e, t) {
	let n = Math.max(e.from.yPt, t.from.yPt), r = {
		xPt: e.from.xPt,
		yPt: n
	}, i = {
		xPt: t.to.xPt,
		yPt: n
	}, { path: a, ...o } = e;
	return {
		...o,
		from: r,
		to: i,
		...e.style === "wavy" ? { path: yg(r, i, e.widthPt) } : {}
	};
}
function T_(e) {
	let t = [];
	e.forEach((n, r) => {
		if (n.kind !== "text") {
			t = [];
			return;
		}
		let i = [], a = [], o = /* @__PURE__ */ new Set();
		for (let s of n.decorations) {
			let n = t.filter((e) => !o.has(e) && C_(e.decoration, s)).sort((e, t) => Math.abs(e.decoration.from.yPt - s.from.yPt) - Math.abs(t.decoration.from.yPt - s.from.yPt))[0];
			if (n) {
				o.add(n);
				let t = e[n.placementIndex];
				if (!t || t.kind !== "text") throw Error("Continuous decoration owner left the retained text line");
				let r = [...t.decorations], i = w_(n.decoration, s);
				r[n.decorationIndex] = i, e[n.placementIndex] = {
					...t,
					decorations: r
				}, a.push({
					...n,
					decoration: i
				});
			} else {
				let e = i.length;
				i.push(s), a.push({
					placementIndex: r,
					decorationIndex: e,
					decoration: s
				});
			}
		}
		e[r] = {
			...n,
			decorations: i
		}, t = a;
	});
}
function E_(e) {
	let { line: t } = e, n = t.segments, r = e.baseRtl || bs(n), i = xs(n.map((e) => e.kind === "tab" ? { isTab: !0 } : e.kind === "text" ? {
		text: e.text,
		rtl: e.rtl,
		digitsAsAN: e.digitsAsAN
	} : {}), e.baseRtl), a = n.reduce((e, t) => e + h_(t), 0), o = e.paragraphXPt + t.xOffsetPt, s = Math.min(e.availableWidthPt, t.availableWidthPt), c = e.isFirstLine ? e.numbering ? f_(e.numbering.bodyOffsetPt, "numbering.bodyOffsetPt") : e.firstLineIndentPt ?? 0 : 0, l = e.baseRtl ? 0 : c, u = (e.baseRtl ? s - c : s) - l - a, d = e.isLastLine || t.endsWithBreak, f = e.displayMathJustification === void 0 ? Ss(e.alignment, e.baseRtl) : m_(e.displayMathJustification), p = f === "justify" && (!d || e.stretchLastLine), m = p ? __(e.alignment) : null;
	if (m && u > 0) {
		let e = sg(n.map((e) => e.kind === "text" ? { text: e.text } : {}), u, m, (e, t) => {
			let r = n[e];
			return r?.kind === "text" ? v_(r, t) : 0;
		});
		e && (n = n.map((t, n) => {
			if (t.kind !== "text") return t;
			let r = e.perSeg.get(n);
			if (!r) return t;
			let i = t.basePaintOps[0];
			if (!i) throw Error("Kashida acquisition requires a contextual text paint operation");
			return {
				...t,
				measuredWidthPt: t.measuredWidthPt + r.advanceDeltaPx,
				basePaintOps: [{
					...i,
					text: r.text,
					sourceMapping: "kashida"
				}]
			};
		}), a += e.appliedPx, u = e.residualPx);
	}
	let h = i.order.at(-1) ?? -1, g = 0;
	if (!r) {
		let e = n.findIndex((e) => e.kind !== "text" || /\S/.test(e.text));
		g = e < 0 ? 0 : e;
	}
	let _ = null, v = 0, y = 0, b = g_(n);
	if (p) {
		let i = y_(jh(b, u, g, r ? h : n.length, -(t.baselinePt - t.topPt) * .25, u > 0, e.alignment === "thaiDistribute" && u > 0), n);
		_ = i?.perSeg ?? null, v = i?.perGap ?? 0, y = Mh(i);
	} else if (u < 0) {
		let e = y_(Nh(b, u, g, r ? h : n.length, t.baselinePt - t.topPt), n);
		_ = e?.perSeg ?? null, v = e?.perGap ?? 0, y = Mh(e);
	}
	let x = a + y, S = u - y, C = f === "right" ? S : f === "center" ? S / 2 : f === "justify" && e.baseRtl && !p ? S : 0, w = o + l, T = e.decimalAutoTabPt === void 0 ? C : Math.max(0, e.paragraphXPt + e.decimalAutoTabPt - x - w), E = w + T, D = [];
	for (let e of i.order) {
		let r = n[e];
		if (!r) continue;
		let a = _?.get(e), o = a?.internalStretch ?? 0, s = h_(r) + o;
		if (r.kind === "tab") {
			let e = {
				xPt: E,
				yPt: t.topPt,
				widthPt: r.measuredWidthPt,
				heightPt: t.advancePt
			};
			D.push({
				kind: "tab",
				range: r.range,
				bounds: e,
				advancePt: r.measuredWidthPt,
				leader: r.leader,
				...r.leader === "none" ? {} : r.leaderShape ? { leaderGlyphs: pg({
					interval: e,
					baselinePt: t.baselinePt,
					...r.leaderShape
				}) } : {}
			});
		} else if (r.kind === "resource") D.push({
			kind: "resource",
			range: r.range,
			resourceKey: r.resourceKey,
			resourceKind: r.resourceKind,
			...r.orientation ? { orientation: r.orientation } : {},
			bounds: {
				xPt: E,
				yPt: t.baselinePt + r.topOffsetPt,
				widthPt: r.widthPt,
				heightPt: r.heightPt
			},
			advancePt: r.measuredWidthPt
		});
		else if (r.kind === "unavailable-resource") D.push({
			kind: "drawing",
			range: r.range,
			drawingId: r.drawingId,
			bounds: {
				xPt: E,
				yPt: t.baselinePt + r.topOffsetPt,
				widthPt: r.widthPt,
				heightPt: r.heightPt
			},
			advancePt: r.measuredWidthPt
		});
		else if (r.kind === "anchor-host") D.push({
			kind: "anchor-host",
			range: r.range,
			bounds: {
				xPt: E,
				yPt: t.topPt,
				widthPt: 0,
				heightPt: t.advancePt
			},
			baselinePt: t.baselinePt,
			...r.sourceMetrics ? { sourceMetrics: r.sourceMetrics } : {},
			...r.anchorOccurrenceId ? { anchorOccurrenceId: r.anchorOccurrenceId } : {}
		});
		else {
			let { measuredWidthPt: n, breakBefore: o, rtl: c, digitsAsAN: l, fixedPitch: u, textLayoutService: d, textShapeRequest: f, retainedGeometry: p, direction: m, ...h } = r, g = b_(r, a, v), _ = i.rtl[e] ? "rtl" : "ltr", y = _ === "rtl" ? x_(g.paintOps, g.clusters) : g.paintOps, b = r.text.trimEnd().length, x = _ === "rtl" ? (h.fitText?.trailingPadPt ?? 0) + r.clusters.filter((e) => e.range.start >= r.range.start + b).reduce((e, t) => e + t.advancePt, 0) : 0, S = a?.trailingGap ? v : 0, C = {
				xPt: E + x,
				yPt: t.baselinePt
			}, w = g.paintOps[0]?.offset.yPt ?? 0, T = {
				xPt: E,
				yPt: t.baselinePt + w
			}, O = p ? bg({
				origin: T,
				advancePt: s + S,
				base: p.base,
				color: Y_(h.color),
				...p.underline ? { underline: p.underline } : {},
				...p.strike ? { strike: p.strike } : {}
			}) : h.decorations, k = p?.emphasis ? {
				authored: p.emphasis.authored,
				glyphs: xg({
					authored: p.emphasis.authored,
					glyph: p.emphasis.glyph,
					origin: {
						xPt: C.xPt,
						yPt: t.baselinePt + w
					},
					clusters: g.clusters,
					clusterInk: p.emphasis.clusterInk,
					mark: p.emphasis.mark,
					scaleX: r.basePaintOps[0]?.scaleX ?? 1
				})
			} : void 0, A = {
				...h,
				kind: "text",
				origin: C,
				bounds: {
					xPt: E,
					yPt: t.topPt,
					widthPt: s,
					heightPt: t.advancePt
				},
				advancePt: s,
				clusters: g.clusters,
				paintOps: y.map((e) => ({
					...e,
					direction: _
				})),
				decorations: O,
				...k ? { emphasis: k } : {},
				direction: _,
				...S === 0 ? {} : { ownedTrailingSlackPt: S },
				...h.highlight || h.background ? { highlightFragments: [{
					rect: {
						xPt: E,
						yPt: t.topPt,
						widthPt: s + S,
						heightPt: t.advancePt
					},
					color: h.highlight ?? h.background
				}] } : {},
				...h.ruby ? { ruby: {
					...h.ruby,
					paintOps: h.ruby.paintOps.map((e) => ({
						...e,
						origin: {
							xPt: e.origin.xPt + E + (s - r.measuredWidthPt) / 2,
							yPt: e.origin.yPt + t.baselinePt
						}
					}))
				} } : {}
			};
			D.push(A);
		}
		E += s, a?.trailingGap && (E += v);
	}
	for (let e = 0; e < D.length;) {
		let t = D[e];
		if (t?.kind !== "text" || !t.runBorder) {
			e += 1;
			continue;
		}
		let n = e + 1;
		for (; n < D.length;) {
			let e = D[n];
			if (e?.kind !== "text" || !e.runBorder) break;
			n += 1;
		}
		let r = Cg(D.slice(e, n).map((e) => ({
			bounds: e.bounds,
			trailingSlackPt: e.ownedTrailingSlackPt ?? 0,
			border: e.runBorder
		})));
		D[e] = {
			...t,
			runBorderFragments: r
		}, e = n;
	}
	return T_(D), Fn({
		range: t.range,
		bounds: {
			xPt: w + T,
			yPt: t.topPt,
			widthPt: x,
			heightPt: t.advancePt
		},
		baselinePt: t.baselinePt,
		advancePt: t.advancePt,
		placements: D
	});
}
function D_(e) {
	let t = e.continuation, n = t?.lineStart ?? 0, r = t?.lineEnd ?? e.lines.length;
	if (n < 0 || r < n || r > e.lines.length) throw RangeError("Paragraph continuation line range is outside the retained lines");
	let i = t?.continuesFromPrevious ? 0 : e.spacing.beforePt;
	for (let a = n; a < r; a += 1) {
		let r = e.lines[a];
		if (r) {
			if (a === 0 && !t?.continuesFromPrevious) i += Math.max(0, r.bounds.yPt - (e.flowBounds.yPt + e.spacing.beforePt));
			else if (a > n) {
				let t = e.lines[a - 1];
				i += Math.max(0, r.bounds.yPt - ((t?.bounds.yPt ?? r.bounds.yPt) + (t?.advancePt ?? 0)));
			}
			i += f_(r.advancePt, "line.advancePt");
		}
	}
	return e.lines.length === 0 && e.paragraphMark && (i += f_(e.paragraphMark.bounds.heightPt, "paragraphMark.heightPt")), t?.continuesOnNext || (i += e.spacing.afterPt), i;
}
function O_(e) {
	let t = e.continuation?.lineStart ?? 0, n = e.continuation?.lineEnd ?? e.lines.length, r = e.lines.slice(t, n), i = e.continuation ? D_(e) : f_(e.flowBounds.heightPt, "flowBounds.heightPt");
	return Fn({
		kind: "paragraph",
		id: e.id,
		source: e.source,
		...e.paragraphId === void 0 ? {} : { paragraphId: e.paragraphId },
		flowDomainId: e.flowDomainId,
		ordinaryFlow: e.ordinaryFlow,
		...e.styleId === void 0 ? {} : { styleId: e.styleId },
		...e.bookmarkStarts?.length ? { bookmarkStarts: e.bookmarkStarts } : {},
		flowBounds: {
			...e.flowBounds,
			heightPt: i
		},
		inkBounds: e.inkBounds,
		...e.clipBounds ? { clipBounds: e.clipBounds } : {},
		advancePt: i,
		spacing: e.spacing,
		contextualSpacing: e.contextualSpacing ?? !1,
		lines: r,
		borders: e.borders,
		...e.shading ? { shading: e.shading } : {},
		resources: e.resources,
		drawings: e.drawings,
		textBoxes: e.textBoxes,
		events: e.events,
		exclusions: e.exclusions,
		...e.cellContainmentBounds ? { cellContainmentBounds: e.cellContainmentBounds } : {},
		...e.anchorCollisions?.length ? { anchorCollisions: e.anchorCollisions } : {},
		...e.anchorFrames ? { anchorFrames: e.anchorFrames } : {},
		...e.paragraphMark ? { paragraphMark: e.paragraphMark } : {},
		...e.continuation ? { continuation: e.continuation } : {}
	});
}
function k_(e, t) {
	return {
		...e,
		path: [...e.path, t]
	};
}
function A_(e, t) {
	if (e.status === "planned") return Object.freeze([]);
	let n = Object.freeze({
		...t,
		path: Object.freeze([...t.path])
	});
	return Object.freeze(e.diagnostics.map((e) => Object.freeze({
		...e,
		source: n
	})));
}
function j_(e) {
	return On("chart-resource", e);
}
function M_(e, t) {
	return On("unavailable-drawing", k_(e, t));
}
function N_(e, t) {
	return Object.freeze({
		code: "MISSING_RESOURCE",
		severity: "warning",
		source: Object.freeze({
			...t,
			path: Object.freeze([...t.path])
		}),
		message: `Drawing ${e} resource is unavailable`
	});
}
function P_(e) {
	return $g(e) || (/^date$/i.test(e.fieldType) ? "date" : /^time$/i.test(e.fieldType) ? "time" : "document");
}
function F_(e) {
	return e.sourceRunIndex;
}
function I_(e) {
	if (!e.textLayoutService || !e.textShapeRequest) return;
	let t = e.textLayoutService.shape({
		...e.textShapeRequest,
		text: e.text,
		measure: !0
	});
	return {
		ascentPt: t.ascentPt,
		descentPt: t.descentPt
	};
}
var L_ = Object.freeze({
	yellow: "#FFFF00",
	cyan: "#00FFFF",
	green: "#00FF00",
	magenta: "#FF00FF",
	blue: "#0000FF",
	red: "#FF0000",
	darkBlue: "#000080",
	darkCyan: "#008080",
	darkGreen: "#008000",
	darkMagenta: "#800080",
	darkRed: "#800000",
	darkYellow: "#808000",
	darkGray: "#808080",
	lightGray: "#C0C0C0",
	black: "#000000",
	white: "#FFFFFF"
});
function R_(e) {
	return e.startsWith("#") ? e : L_[e] ?? "#FFFF00";
}
function z_(e) {
	let t = Ka(e.vertAlign, e.fontSize) + (e.position ?? 0);
	return t === 0 ? 0 : -t;
}
function B_(e, t, n, r, i, a, o) {
	let s = F_(e), c = s === void 0 ? void 0 : t.runs[s], l = p_(c);
	if (e.metricOnly) {
		let t = I_(e);
		return {
			kind: "anchor-host",
			range: {
				start: n,
				end: n
			},
			bounds: {
				xPt: r,
				yPt: a,
				widthPt: 0,
				heightPt: o
			},
			baselinePt: i,
			...t ? { sourceMetrics: t } : {}
		};
	}
	let u = e.color ? {
		kind: "explicit",
		color: `#${e.color}`
	} : e.colorAuto ? {
		kind: "auto",
		...e.background ? { background: `#${e.background}` } : {}
	} : { kind: "default" }, d = e.fontRoute ?? it(e.fontFamily ? `"${e.fontFamily.replaceAll("\"", "\\\"")}"` : "sans-serif", e.fontFamily ? "native" : "generic"), f = e.ruby && e.textLayoutService && e.textShapeRequest ? e.textLayoutService.shape({
		...e.textShapeRequest,
		text: e.text,
		measure: !0
	}) : void 0, p = e.ruby && e.textLayoutService && e.textShapeRequest ? e.textLayoutService.shape({
		...e.textShapeRequest,
		text: e.ruby.text,
		fontSizePt: e.ruby.fontSizePt,
		measure: !0
	}) : void 0, m = e.ruby && p ? (p.clusters ?? []).map((t) => {
		let n = p.spans.find((e) => e.start <= t.range.start && e.end >= t.range.end) ?? p.spans[0];
		if (!n) throw Error("Ruby shaping produced no selected-face span");
		return {
			text: e.ruby.text.slice(t.range.start, t.range.end),
			offsetPt: t.offsetPt,
			fontRoute: n.fontRoute,
			fontSizePt: e.ruby.fontSizePt,
			fontWeight: n.font.weight,
			fontStyle: n.font.style,
			color: u
		};
	}) : [], h = l?.ruby?.raisePt.status === "valid" ? l.ruby.raisePt.value ?? void 0 : e.ruby?.hpsRaisePt, g = e.ruby && p ? mg({
		baseOrigin: {
			xPt: 0,
			yPt: 0
		},
		baseAdvancePt: e.measuredWidth,
		guideAdvancePt: p.advancePt,
		...h === void 0 ? {} : { raisePt: h },
		...f?.inkBounds && p.inkBounds ? {
			baseInkTopPt: -f.inkBounds.ascentPt,
			guideInkBottomFromBaselinePt: p.inkBounds.descentPt
		} : {},
		spans: m
	}) : [], _ = z_(e);
	return {
		kind: "text",
		text: e.text,
		...s === void 0 ? {} : { sourceRunIndex: s },
		...c?.type === "field" ? {
			role: "field-result",
			dependency: P_(c)
		} : {},
		...c?.type === "text" && (c.noteRef?.kind === "footnote" || c.noteRef?.kind === "endnote") ? { noteReference: {
			kind: c.noteRef.kind,
			id: c.noteRef.id
		} } : {},
		range: {
			start: n,
			end: n + e.text.length
		},
		origin: {
			xPt: r,
			yPt: i + _
		},
		bounds: {
			xPt: r,
			yPt: a,
			widthPt: e.measuredWidth,
			heightPt: o
		},
		advancePt: e.measuredWidth,
		clusters: [{
			range: {
				start: n,
				end: n + e.text.length
			},
			offset: {
				xPt: 0,
				yPt: 0
			},
			advancePt: e.measuredWidth
		}],
		color: u,
		fontRoute: d,
		fontSizePt: Sr(e, 1),
		fontWeight: e.bold ? 700 : 400,
		fontStyle: e.italic ? "italic" : "normal",
		direction: e.rtl ? "rtl" : "ltr",
		...e.verticalRun ? { writingMode: "vertical-rl" } : {},
		...e.charSpacing === void 0 ? {} : { characterSpacingPt: e.charSpacing },
		...e.charScale === void 0 ? {} : { characterScale: e.charScale },
		...e.fitTextRegionIndex === void 0 ? {} : { fitText: {
			regionIndex: e.fitTextRegionIndex,
			perGapPt: e.fitTextPerGapPx ?? 0,
			trailingPadPt: e.fitTextTrailingPadPx ?? 0
		} },
		...e.kerning === void 0 ? {} : { kerning: e.fontSize >= e.kerning },
		...e.position === void 0 ? {} : { positionPt: e.position },
		...e.vertAlign ? { verticalAlign: e.vertAlign } : {},
		...e.tateChuYoko ? { tateChuYoko: !0 } : {},
		...e.tateChuYokoCompress ? { tateChuYokoCompress: !0 } : {},
		...e.ruby && p ? { ruby: {
			text: e.ruby.text,
			advancePt: p.advancePt,
			authored: {
				...l?.ruby?.align.status === "valid" && l.ruby.align.value ? { align: l.ruby.align.value } : {},
				...l?.ruby?.baseFontSizePt.status === "valid" && l.ruby.baseFontSizePt.value !== null ? { baseFontSizePt: l.ruby.baseFontSizePt.value } : {},
				...h === void 0 ? {} : { raisePt: h },
				...l?.ruby?.language.status === "valid" && l.ruby.language.value ? { language: l.ruby.language.value } : {}
			},
			paintOps: g
		} } : {},
		...e.emphasisMark ? { emphasisMark: e.emphasisMark } : {},
		...e.highlight ? { highlight: R_(e.highlight) } : {},
		...e.background ? { background: `#${e.background}` } : {},
		...e.border ? { runBorder: {
			val: l?.border?.val.value ?? e.border.style,
			color: e.border.color ? `#${e.border.color}` : "#000000",
			widthPt: e.border.width,
			spacePt: e.border.space ?? 0,
			...l?.border?.themeColor.value ? { themeColor: l.border.themeColor.value } : {},
			...l?.border?.themeTint.value ? { themeTint: l.border.themeTint.value } : {},
			...l?.border?.themeShade.value ? { themeShade: l.border.themeShade.value } : {},
			...l?.border?.shadow.status === "valid" && l.border.shadow.value !== null ? { shadow: l.border.shadow.value } : {},
			...l?.border?.frame.status === "valid" && l.border.frame.value !== null ? { frame: l.border.frame.value } : {}
		} } : {},
		...e.revision ? { revision: e.revision } : {},
		typography: {
			caps: l?.caps ?? !1,
			smallCaps: l?.smallCaps ?? e.smallCaps === !0,
			strike: l?.strike ?? e.strikethrough,
			doubleStrike: l?.doubleStrike ?? e.doubleStrikethrough === !0,
			verticalAlign: l?.verticalAlign ?? {
				status: e.vertAlign ? "valid" : "missing",
				raw: e.vertAlign ?? null,
				value: e.vertAlign ?? null
			},
			positionPt: l?.positionPt ?? {
				status: e.position === void 0 ? "missing" : "valid",
				raw: e.position === void 0 ? null : String(e.position * 2),
				value: e.position ?? null
			},
			emphasis: l?.emphasis ?? {
				status: e.emphasisMark ? "valid" : "missing",
				raw: e.emphasisMark ?? null,
				value: e.emphasisMark ?? null
			},
			...l?.underline ? { underline: l.underline } : {}
		},
		decorations: [],
		paintOps: [{
			text: e.text,
			range: {
				start: n,
				end: n + e.text.length
			},
			offset: {
				xPt: 0,
				yPt: _
			},
			letterSpacingPt: Oo(e),
			scaleX: e.charScale ?? 1,
			direction: e.rtl ? "rtl" : "ltr",
			kerning: e.kerning === void 0 ? "auto" : e.fontSize >= e.kerning ? "normal" : "none",
			writingMode: e.verticalRun ? "vertical-rl" : "horizontal-tb"
		}],
		...e.hyperlink ? { hyperlink: e.hyperlink } : {}
	};
}
function V_(e, t) {
	let n = e.layout, r = n.visibleAscent ?? n.ascent, i = r + (n.visibleDescent ?? n.descent), a = t.lineSpacing?.rule === "auto" && !t.hasRuby && !t.lineGrid.active, o = a && (t.lineSpacing?.value ?? 1) < 1, s = a && !o ? Math.max(i, n.visibleIntendedSingle ?? n.intendedSingle) : e.advancePt;
	return e.topYPt + (s - i) / 2 + r;
}
function H_(e, t, n) {
	let r = e.numbering;
	if (!r) return;
	if (t.numberingMarkerGeometry) return t.numberingMarkerGeometry;
	let i = e.numberingMarkerShapeInput, a = n.environment.layoutServices?.text;
	if (!(!i || !a)) return As(r, i, {
		authoredFirstIndentPt: e.indentFirst,
		physicalIndentLeftPt: t.physicalIndentLeftPt,
		tabStops: e.tabStops,
		defaultTabPt: t.defaultTabPt
	}, a);
}
function U_(e, t, n, r, i) {
	return i.bounds.widthPt <= 0 ? t.baseRtl ? n + r : n : t.baseRtl ? i.bounds.xPt + i.bounds.widthPt + e.bodyOffsetPt : i.bounds.xPt - e.bodyOffsetPt;
}
function W_(e, t, n, r, i, a) {
	if (!e.shape || e.markerText === "") return [];
	let o = e.shape, s = Es({
		baseRtl: n.baseRtl,
		alignedLeadingEdgePt: U_(e, n, r, i, a),
		authoredFirstIndentPt: t.indentFirst,
		markerShiftPt: e.markerShiftPt,
		markerWidthPt: e.markerWidthPt
	}), c = -e.markerText.length, l = t.numbering?.color ? {
		kind: "explicit",
		color: `#${t.numbering.color}`
	} : t.numbering?.colorAuto ? { kind: "auto" } : t.paragraphMarkColor ? {
		kind: "explicit",
		color: `#${t.paragraphMarkColor}`
	} : { kind: "default" }, u = 0;
	return o.spans.map((e) => {
		let r = u;
		u += e.advancePt;
		let i = o.clusters ? o.clusters.filter((t) => t.range.start >= e.start && t.range.end <= e.end).map((e) => ({
			range: {
				start: c + e.range.start,
				end: c + e.range.end
			},
			offset: {
				xPt: e.offsetPt - r,
				yPt: 0
			},
			advancePt: e.advancePt
		})) : [{
			range: {
				start: c + e.start,
				end: c + e.end
			},
			offset: {
				xPt: 0,
				yPt: 0
			},
			advancePt: e.advancePt
		}], d = s + r;
		return {
			kind: "text",
			role: "numbering-marker",
			text: e.text,
			range: {
				start: c + e.start,
				end: c + e.end
			},
			origin: {
				xPt: d,
				yPt: a.baselinePt
			},
			bounds: {
				xPt: d,
				yPt: a.baselinePt - e.ascentPt,
				widthPt: e.advancePt,
				heightPt: e.ascentPt + e.descentPt
			},
			advancePt: e.advancePt,
			clusters: i,
			paintOps: [{
				text: e.text,
				range: {
					start: c + e.start,
					end: c + e.end
				},
				offset: {
					xPt: 0,
					yPt: 0
				},
				letterSpacingPt: 0,
				scaleX: 1,
				direction: n.baseRtl ? "rtl" : "ltr",
				kerning: "auto",
				writingMode: "horizontal-tb"
			}],
			color: l,
			fontRoute: e.fontRoute,
			fontSizePt: t.numberingMarkerShapeInput?.fontSizePt ?? e.ascentPt + e.descentPt,
			fontWeight: e.font.weight,
			fontStyle: e.font.style,
			direction: n.baseRtl ? "rtl" : "ltr",
			decorations: []
		};
	});
}
function G_(e) {
	if (e) return e.startsWith("#") ? e : `#${e}`;
}
function K_(e, t, n) {
	let r = G_(t), i = G_(n);
	return e.map((e) => ({
		...e,
		placements: e.placements.map((e) => {
			if (e.kind !== "text") return e;
			let t = e.background ?? r ?? i;
			return !t || e.color.kind === "explicit" ? e : {
				...e,
				color: {
					kind: "auto",
					background: t
				}
			};
		})
	}));
}
function q_(e) {
	return e != null && e.style !== "none";
}
function J_(e, t, n, r, i, a, o) {
	let s = n, c = n + r;
	e.indentFirst < 0 && (e.bidi ? c -= e.indentFirst : s += e.indentFirst);
	for (let e of t.flatMap((e) => e.placements)) !(e.kind === "text" && e.role === "numbering-marker" || e.kind === "resource" && e.resourceKind === "picture-bullet") || !e.bounds || (s = Math.min(s, e.bounds.xPt), c = Math.max(c, e.bounds.xPt + e.bounds.widthPt));
	let l = e.borders, u = o.top === "none" ? null : l?.[o.top] ?? null, d = o.bottom === "none" ? null : l?.bottom ?? null, f = q_(l?.left ?? null) ? l.left.space ?? 0 : 0, p = q_(l?.right ?? null) ? l.right.space ?? 0 : 0, m = q_(u) ? u.space ?? 0 : 0, h = q_(d) ? d.space ?? 0 : 0;
	return {
		xPt: s - f,
		yPt: i - m,
		widthPt: c - s + f + p,
		heightPt: a + m + h
	};
}
function Y_(e) {
	return e.kind === "explicit" ? e.color : e.kind === "auto" ? se(e.background ?? "#FFFFFF") : "#000000";
}
function X_(e) {
	return e.inkBounds ?? {
		xMinPt: 0,
		xMaxPt: e.advancePt,
		ascentPt: e.ascentPt,
		descentPt: e.descentPt
	};
}
function Z_(e) {
	return e === "circle" ? "○" : e === "comma" ? "﹅" : "•";
}
function Q_(e, t, n) {
	if (!(e.underline || e.strikethrough || e.doubleStrikethrough || e.emphasisMark)) return;
	let r = e.textLayoutService, i = e.textShapeRequest;
	if (!r || !i) throw Error("Retained typography geometry requires TextLayoutService");
	let a = (e) => r.shape({
		...i,
		text: e,
		measure: !0
	}), o = (e) => {
		let t = a(e), n = t.spans[0];
		if (!n || t.spans.length !== 1 || n.start !== 0 || n.end !== e.length) throw Error("Retained decoration probe requires one selected-face span");
		return {
			ascentPt: n.ascentPt,
			descentPt: n.descentPt,
			...n.inkBounds ? { inkBounds: n.inkBounds } : {}
		};
	}, s = a(e.text), c = Y_(n), l = e.underline ? {
		...e.underlineStyle ? { authoredStyle: e.underlineStyle } : {},
		color: e.underlineColor && e.underlineColor !== "auto" ? `#${e.underlineColor}` : c,
		probe: o("_")
	} : void 0, u = e.strikethrough || e.doubleStrikethrough ? {
		double: e.doubleStrikethrough === !0,
		probe: o("-"),
		...e.doubleStrikethrough ? { doubleProbe: o("=") } : {}
	} : void 0, d = e.emphasisMark ? (() => {
		let r = Z_(e.emphasisMark), o = a(r), s = o.spans[0];
		if (!s) throw Error("Emphasis shaping produced no selected-face span");
		let c = (e.shapedClusters ?? []).map((n) => {
			let r = e.text.slice(n.range.start, n.range.end);
			return {
				text: r,
				range: {
					start: t + n.range.start,
					end: t + n.range.end
				},
				ink: X_(a(r))
			};
		});
		return {
			authored: e.emphasisMark,
			glyph: r,
			mark: {
				inkBounds: X_(o),
				fontRoute: s.fontRoute,
				fontSizePt: i.fontSizePt,
				fontWeight: s.font.weight,
				fontStyle: s.font.style,
				color: n
			},
			clusterInk: c
		};
	})() : void 0;
	return {
		base: s,
		...l ? { underline: l } : {},
		...u ? { strike: u } : {},
		...d ? { emphasis: d } : {}
	};
}
function $_(e, t, n, r, i, a) {
	if (e.metricOnly) {
		let t = I_(e);
		return {
			kind: "anchor-host",
			measuredWidthPt: 0,
			range: {
				start: n,
				end: n
			},
			...t ? { sourceMetrics: t } : {},
			...i?.type === "anchorHost" && i.anchorOccurrenceId ? { anchorOccurrenceId: i.anchorOccurrenceId } : {}
		};
	}
	let o = B_(e, t, n, 0, 0, 0, 0);
	if (o.kind !== "text") throw Error("Visible text segment projected as anchor host");
	let s = e.fitTextPerGapPx ?? Oo(e) + (e.snapToCharacterGrid === !1 ? 0 : r), c = e.charScale ?? 1, l = z_(e), u = Q_(e, n, o.color), d = e.shapedClusters, f = d?.length && d[0]?.range.start === 0 && d.at(-1)?.range.end === e.text.length && d.every((e, t) => t === 0 || d[t - 1]?.range.end === e.range.start) && d.every((e) => e.range.start < e.range.end && Number.isFinite(e.offsetPt) && Number.isFinite(e.advancePt)) ? d : void 0;
	if (e.text.length > 0 && !f) throw Error("Visible text acquisition requires complete authoritative grapheme clusters from TextLayoutService");
	let p = (f ?? []).map((t, r) => {
		let i = e.text.slice(0, t.range.start), a = e.text.slice(t.range.start, t.range.end), o = [...i].length, u = [...a].length, d = r === (f?.length ?? 0) - 1 ? e.fitTextTrailingPadPx ?? 0 : 0, p = e.punctuationCompressions?.filter((e) => e.end <= t.range.start).reduce((e, t) => e + t.adjustmentPt, 0) ?? 0, m = e.punctuationCompressions?.filter((e) => e.end > t.range.start && e.end <= t.range.end).reduce((e, t) => e + t.adjustmentPt, 0) ?? 0;
		return {
			range: {
				start: n + t.range.start,
				end: n + t.range.end
			},
			offset: {
				xPt: t.offsetPt * c + o * s + p,
				yPt: l
			},
			advancePt: t.advancePt * c + u * s + d + m
		};
	}), { origin: m, bounds: h, advancePt: g, paintOps: _, clusters: v, ...y } = o, b = e.tateChuYoko && e.tateChuYokoCompress ? (() => {
		if (!e.textLayoutService || !e.textShapeRequest) throw Error("Tate-chu-yoko compression requires TextLayoutService");
		let t = e.textLayoutService.shape({
			...e.textShapeRequest,
			text: e.text,
			fontSizePt: o.fontSizePt,
			measure: !0,
			clusterGeometry: !1
		}), n = t.ascentPt + t.descentPt;
		return n > o.fontSizePt && n > 0 ? o.fontSizePt / n : 1;
	})() : 1, x = e.punctuationCompressions?.some((t) => t.end < e.text.length) ?? !1, S = e.verticalRun ? (() => {
		if (!a) throw Error("Vertical glyph planning capability is required for vertical text");
		let t = _[0];
		return a.planRun({
			text: e.text,
			font: at(o.fontRoute, o.fontSizePt, o.fontWeight, o.fontStyle),
			fontKerning: t.kerning,
			fontSizePt: o.fontSizePt,
			letterSpacingPt: s,
			charScale: c,
			growTrRotateInk: !0,
			writingMode: t.writingMode
		}).map((r) => ({
			...t,
			text: r.text,
			range: {
				start: n + r.range.start,
				end: n + r.range.end
			},
			offset: {
				xPt: r.originPt + (e.punctuationCompressions?.filter((e) => e.end <= r.range.start).reduce((e, t) => e + t.adjustmentPt, 0) ?? 0),
				yPt: l
			},
			letterSpacingPt: s,
			glyphOrientation: r.orientation,
			...r.verticalFeature ? { verticalFeature: !0 } : {},
			...r.blockAxisInkBounds ? { blockAxisInkBounds: r.blockAxisInkBounds } : {},
			...r.drawOffsetPt.xPt !== 0 || r.drawOffsetPt.yPt !== 0 ? { glyphOffsetPt: r.drawOffsetPt } : {}
		}));
	})() : e.tateChuYoko ? _.map((t) => ({
		...t,
		offset: {
			xPt: t.offset.xPt + e.measuredWidth / 2,
			yPt: t.offset.yPt
		},
		glyphOrientation: "upright",
		...b === 1 ? {} : { scaleY: b }
	})) : x ? (() => {
		let t = _[0], r = [];
		for (let t of p) {
			let i = t.range.end - n, a = e.punctuationCompressions?.find((e) => e.end === i)?.adjustmentPt ?? null, o = r.at(-1);
			o && o.adjustmentPt === a ? o.end = t.range.end : r.push({
				start: t.range.start,
				end: t.range.end,
				offset: t.offset,
				adjustmentPt: a
			});
		}
		return r.map((r) => ({
			...t,
			text: e.text.slice(r.start - n, r.end - n),
			range: {
				start: r.start,
				end: r.end
			},
			offset: r.offset,
			letterSpacingPt: s + (r.adjustmentPt ?? 0)
		}));
	})() : _;
	return {
		...y,
		kind: "text",
		measuredWidthPt: e.measuredWidth,
		clusters: p,
		basePaintOps: S.map((t) => ({
			...t,
			letterSpacingPt: e.verticalRun && t.glyphOrientation !== "sideways" ? 0 : x ? t.letterSpacingPt : s,
			...!e.verticalRun && e.selectedFaceInkBounds ? { inkBounds: e.selectedFaceInkBounds } : {},
			...!e.verticalRun && e.selectedFaceInkBounds && t.glyphOrientation === void 0 ? { blockAxisInkBounds: {
				startPt: (t.glyphOffsetPt?.yPt ?? 0) - e.selectedFaceInkBounds.ascentPt,
				endPt: (t.glyphOffsetPt?.yPt ?? 0) + e.selectedFaceInkBounds.descentPt
			} } : {}
		})),
		breakBefore: e.breakBefore !== !1 && !e.joinPrev,
		rtl: e.rtl,
		digitsAsAN: e.digitsAsAN,
		fixedPitch: e.fitTextRegionIndex !== void 0,
		...u ? { retainedGeometry: u } : {},
		...e.textLayoutService ? { textLayoutService: e.textLayoutService } : {},
		...e.textShapeRequest ? { textShapeRequest: e.textShapeRequest } : {}
	};
}
function ev(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let e of t.lines) for (let t of e.layout.segments) {
		let e = F_(t);
		if (e === void 0) continue;
		let r = "text" in t ? t.metricOnly ? 0 : t.text.length : "mathNodes" in t ? t.fallbackText.length : +("isTab" in t || "imagePath" in t);
		n.set(e, (n.get(e) ?? 0) + r);
	}
	let r = e.runs.map((e, t) => {
		let r = n.get(t);
		return r === void 0 ? e.type === "text" ? e.text.length : e.type === "field" ? e.fallbackText.length : e.type === "anchorHost" ? 0 : 1 : r;
	}), i = 0;
	return {
		runStarts: r.map((e) => {
			let t = i;
			return i += e, t;
		}),
		runLengths: r
	};
}
function tv(e) {
	return "text" in e ? e.metricOnly ? 0 : e.text.length : "mathNodes" in e ? e.fallbackText.length : 1;
}
function nv(e, t, n, r, i, a, o, s, c, l, u = !1) {
	let d = 0, f = /* @__PURE__ */ new Map(), p = e.lines.some((e) => e.layout.segments.some((e) => "isTab" in e)), m = t.tabStops?.reduce((e, t) => !e || t.pos < e.pos ? t : e, void 0), h = e.lines.flatMap((e) => e.layout.segments.flatMap((e) => "text" in e && !e.metricOnly ? [e.text] : [])).join("").trim(), g = !p && m?.alignment === "decimal" && h !== "" && /^[+\-(]?[\d., ]+\)?%?$/u.test(h) ? m.pos - a.physicalIndentLeftPt : void 0;
	return e.lines.map((p, m) => {
		let h = p.layout, _ = V_(p, a), v = Infinity, y = d, b = [];
		for (let e of h.segments) {
			let n = F_(e), r = n === void 0 ? void 0 : t.runs[n], s = tv(e), p = n === void 0 ? d : (o.runStarts[n] ?? d) + (f.get(n) ?? 0);
			if (n !== void 0 && f.set(n, (f.get(n) ?? 0) + s), v = Math.min(v, p), y = Math.max(y, p + s), "isTab" in e) {
				let t = e, n = t.leader ?? "none", i;
				if (n !== "none") {
					if (!c) throw Error("Tab leader acquisition requires TextLayoutService");
					let e = n === "hyphen" ? "-" : n === "underscore" || n === "heavy" ? "_" : n === "middleDot" ? "·" : ".", a = r?.type === "text" || r?.type === "field" ? r : void 0, o = a, s = c.shape({
						text: e,
						fontSizePt: t.fontSize,
						fonts: o?.fontSlots?.direct ?? (a?.fontFamily ? { ascii: a.fontFamily } : {}),
						themeFonts: o?.fontSlots?.theme,
						themeFontPresence: o?.fontSlots?.themePresent,
						weight: t.bold ? 700 : 400,
						style: t.italic ? "italic" : "normal",
						measure: !0
					}), l = s.spans[0];
					if (!l || !Number.isFinite(s.advancePt) || s.advancePt <= 0) throw Error("Tab leader acquisition produced no shaped glyph advance");
					i = {
						glyph: e,
						advancePt: s.advancePt,
						fontRoute: l.fontRoute,
						fontSizePt: t.fontSize,
						fontWeight: l.font.weight,
						fontStyle: l.font.style,
						color: a?.color ? {
							kind: "explicit",
							color: `#${a.color}`
						} : o?.colorAuto ? { kind: "auto" } : { kind: "default" }
					};
				}
				b.push({
					kind: "tab",
					range: {
						start: p,
						end: p + s
					},
					measuredWidthPt: t.measuredWidth,
					leader: n,
					fontSizePt: t.fontSize,
					bold: t.bold,
					italic: t.italic,
					...i ? { leaderShape: i } : {}
				});
			} else if ("imagePath" in e) {
				let t = e;
				if (t.anchor) continue;
				let n = F_(e), r = k_(i, n ?? 0);
				if (t.unavailableResourceKind) {
					b.push({
						kind: "unavailable-resource",
						range: {
							start: p,
							end: p + s
						},
						resourceKind: t.unavailableResourceKind,
						measuredWidthPt: t.measuredWidth,
						widthPt: t.widthPt,
						heightPt: t.heightPt,
						topOffsetPt: -t.heightPt,
						drawingId: M_(i, n ?? 0)
					}), d = Math.max(d, p + s);
					continue;
				}
				let a = t.chart ? "chart" : "image", o = t.chart ? j_(r) : jn(r, t.imagePath);
				b.push({
					kind: "resource",
					range: {
						start: p,
						end: p + s
					},
					resourceKey: o,
					resourceKind: a,
					measuredWidthPt: t.measuredWidth,
					widthPt: t.widthPt,
					heightPt: t.heightPt,
					topOffsetPt: -t.heightPt,
					...u ? { orientation: "upright-physical" } : {}
				});
			} else if ("mathNodes" in e) {
				let t = e;
				b.push({
					kind: "resource",
					range: {
						start: p,
						end: p + s
					},
					resourceKey: t.mathResourceKey,
					resourceKind: "math",
					measuredWidthPt: t.measuredWidth,
					widthPt: t.measuredWidth,
					heightPt: t.mathAscent + t.mathDescent,
					topOffsetPt: -t.mathAscent
				});
			} else b.push($_(e, t, p, a.characterGrid.active ? a.characterGrid.deltaPt : 0, r, l));
			d = Math.max(d, p + s);
		}
		let x = h.segments.length === 1 && "mathNodes" in (h.segments[0] ?? {}) ? h.segments[0] : void 0;
		return E_({
			paragraphXPt: n,
			availableWidthPt: r,
			alignment: t.alignment,
			baseRtl: a.baseRtl,
			isFirstLine: m === 0,
			isLastLine: m === e.lines.length - 1,
			stretchLastLine: a.stretchLastLine,
			firstLineIndentPt: a.firstIndentPt,
			...m === 0 && s ? { numbering: { bodyOffsetPt: s.bodyOffsetPt } } : {},
			...g === void 0 ? {} : { decimalAutoTabPt: g },
			...x?.display ? { displayMathJustification: x.jc ?? a.mathDefJc ?? "centerGroup" } : {},
			line: {
				range: {
					start: Number.isFinite(v) ? v : d,
					end: y
				},
				topPt: p.topYPt,
				baselinePt: _,
				advancePt: p.advancePt,
				xOffsetPt: h.xOffset,
				availableWidthPt: h.availWidth,
				endsWithBreak: h.endsWithBreak ?? !1,
				segments: b
			}
		});
	});
}
function rv(e, t) {
	return {
		start: e.start + t,
		end: e.end + t
	};
}
function iv(e, t) {
	if (!Number.isFinite(t) || t < 0) throw RangeError("Paragraph continuation source range must be finite and non-negative");
	let n = e[0];
	if (!n) return e;
	let r = t - n.range.start;
	return r === 0 ? e : e.map((e) => ({
		...e,
		range: rv(e.range, r),
		placements: e.placements.map((e) => {
			let t = rv(e.range, r);
			return e.kind === "text" ? {
				...e,
				range: t,
				clusters: e.clusters.map((e) => ({
					...e,
					range: rv(e.range, r)
				})),
				paintOps: e.paintOps.map((e) => ({
					...e,
					range: rv(e.range, r)
				}))
			} : {
				...e,
				range: t
			};
		})
	}));
}
function av(e, t, n, r, i) {
	let a = e.contentEndYPt - e.contentStartYPt;
	return E_({
		paragraphXPt: n,
		availableWidthPt: r,
		alignment: t.alignment,
		baseRtl: i.baseRtl,
		isFirstLine: !0,
		isLastLine: !0,
		stretchLastLine: i.stretchLastLine,
		line: {
			range: {
				start: 0,
				end: 0
			},
			topPt: e.contentStartYPt,
			baselinePt: e.contentEndYPt - e.lastLineBelowBaselinePt,
			advancePt: a,
			xOffsetPt: 0,
			availableWidthPt: r,
			endsWithBreak: !1,
			segments: []
		}
	});
}
function ov(e, t) {
	let n = t.anchorFrames, r = e.anchorXRelativeFrom ?? (e.anchorXFromMargin ? "margin" : "page"), i = e.anchorYRelativeFrom ?? (e.anchorYFromPara ? "paragraph" : "page"), a = n?.page, o = n?.margin, s = a && o ? {
		xPt: a.xPt,
		yPt: a.yPt,
		widthPt: Math.max(0, o.xPt - a.xPt),
		heightPt: a.heightPt
	} : null, c = a && o ? {
		xPt: o.xPt + o.widthPt,
		yPt: a.yPt,
		widthPt: Math.max(0, a.xPt + a.widthPt - o.xPt - o.widthPt),
		heightPt: a.heightPt
	} : null, l = a && o ? {
		xPt: a.xPt,
		yPt: a.yPt,
		widthPt: a.widthPt,
		heightPt: Math.max(0, o.yPt - a.yPt)
	} : null, u = a && o ? {
		xPt: a.xPt,
		yPt: o.yPt + o.heightPt,
		widthPt: a.widthPt,
		heightPt: Math.max(0, a.yPt + a.heightPt - o.yPt - o.heightPt)
	} : null, d = n?.pageParity === "even", f = r === "page" ? a : r === "column" || r === "character" ? n?.column : r === "leftMargin" ? s : r === "rightMargin" ? c : r === "insideMargin" ? d ? c : s : r === "outsideMargin" ? d ? s : c : o, p = i === "paragraph" || i === "line" || i === "character" ? {
		xPt: t.placement.paragraphXPt,
		yPt: t.placement.startYPt,
		widthPt: t.placement.availableWidthPt,
		heightPt: 0
	} : i === "page" ? a : i === "column" ? n?.column : i === "topMargin" ? l : i === "bottomMargin" ? u : i === "insideMargin" ? d ? u : l : i === "outsideMargin" ? d ? l : u : o;
	if (!f || !p) return null;
	let m = e.widthPt, h = e.heightPt, g = e.anchorXPt ?? 0, _ = e.anchorYPt ?? 0, v = e.type === "shape" ? e.pctPosH : null, y = e.type === "shape" ? e.pctPosV : null;
	return {
		xPt: v == null ? e.anchorXAlign === "center" ? f.xPt + (f.widthPt - m) / 2 : e.anchorXAlign === "right" || e.anchorXAlign === "outside" && !d || e.anchorXAlign === "inside" && d ? f.xPt + f.widthPt - m : f.xPt + g : f.xPt + f.widthPt * v + g,
		yPt: y == null ? e.anchorYAlign === "center" ? p.yPt + (p.heightPt - h) / 2 : e.anchorYAlign === "bottom" || e.anchorYAlign === "outside" && !d || e.anchorYAlign === "inside" && d ? p.yPt + p.heightPt - h : p.yPt + _ : p.yPt + p.heightPt * y + _,
		widthPt: m,
		heightPt: h
	};
}
function sv(e, t) {
	return ov(e, t) ?? {
		xPt: e.anchorXPt + (e.anchorXFromMargin ? t.placement.paragraphXPt : 0),
		yPt: e.anchorYPt + (e.anchorYFromPara ? t.placement.startYPt : 0),
		widthPt: e.widthPt,
		heightPt: e.heightPt
	};
}
function cv(e, t, n, r) {
	let i = fg(e, t, n.environment.layoutServices?.text, e.vmlTextPathInput), a = [i.command], o = A_(i, k_(n.source, r));
	return {
		kind: "drawing",
		id: `${n.id}:drawing:${r}`,
		source: k_(n.source, r),
		flowDomainId: n.flowDomainId,
		flowBounds: t,
		inkBounds: t,
		advancePt: 0,
		ordinaryFlow: !1,
		commands: a,
		...o.length === 0 ? {} : { diagnostics: o },
		anchorLayer: {
			occurrenceId: `public-shape:${n.id}:${r}`,
			behindDoc: e.behindDoc === !0,
			relativeHeight: Number.isFinite(e.zOrder) ? e.zOrder : r,
			sourceOrder: r,
			horizontalOwnership: e.anchorXRelativeFrom === "character" ? "host" : "page",
			verticalOwnership: e.anchorYRelativeFrom === "paragraph" || e.anchorYRelativeFrom === "line" || e.anchorYRelativeFrom === "character" || !e.anchorYRelativeFrom && e.anchorYFromPara ? "host" : "page"
		}
	};
}
function lv(e, t, n) {
	if (!e.anchor || e.anchorAcquisitionInput) return null;
	let r = ov(e, t);
	if (!r) return null;
	let i = e.anchorYRelativeFrom ?? (e.anchorYFromPara ? "paragraph" : "page"), a = k_(t.source, n);
	return {
		kind: "drawing",
		id: `${t.id}:public-anchor-drawing:${n}`,
		source: a,
		flowDomainId: t.flowDomainId,
		flowBounds: r,
		inkBounds: r,
		advancePt: 0,
		ordinaryFlow: !1,
		commands: [{
			kind: "resource",
			resourceKind: e.type,
			resourceKey: e.type === "image" ? jn(a, e.imagePath) : j_(a),
			rect: r,
			...t.environment.verticalPageFrame ? { orientation: "upright-physical" } : {}
		}],
		anchorLayer: {
			occurrenceId: `public-anchor:${t.id}:${n}`,
			behindDoc: !1,
			relativeHeight: n,
			sourceOrder: n,
			horizontalOwnership: "page",
			verticalOwnership: i === "paragraph" ? "host" : "page"
		}
	};
}
function uv(e) {
	return (e.type === "image" || e.type === "chart" || e.type === "shape" || e.type === "unavailableDrawing") && e.anchorAcquisitionInput !== void 0;
}
function dv(e) {
	return [
		{
			xPt: e.xPt,
			yPt: e.yPt
		},
		{
			xPt: e.xPt + e.widthPt,
			yPt: e.yPt
		},
		{
			xPt: e.xPt + e.widthPt,
			yPt: e.yPt + e.heightPt
		},
		{
			xPt: e.xPt,
			yPt: e.yPt + e.heightPt
		}
	];
}
function fv(e, t, n) {
	let r = t.xPt - e.xPt, i = t.yPt - e.yPt, a = e.xPt + e.widthPt - t.xPt - t.widthPt, o = e.yPt + e.heightPt - t.yPt - t.heightPt;
	return {
		xPt: n.xPt - r,
		yPt: n.yPt - i,
		widthPt: Math.max(0, n.widthPt + r + a),
		heightPt: Math.max(0, n.heightPt + i + o)
	};
}
function pv(e, t) {
	return {
		a: t.a,
		b: t.b,
		c: t.c,
		d: t.d,
		e: e.xPt + e.widthPt / 2,
		f: e.yPt + e.heightPt / 2
	};
}
function mv(e, t) {
	let n = [
		rp(t, e),
		rp(t, {
			xPt: e.xPt + e.widthPt,
			yPt: e.yPt
		}),
		rp(t, {
			xPt: e.xPt,
			yPt: e.yPt + e.heightPt
		}),
		rp(t, {
			xPt: e.xPt + e.widthPt,
			yPt: e.yPt + e.heightPt
		})
	];
	if (n.some((e) => e === null)) throw Error("Upright drawing transform must be invertible");
	let r = n, i = Math.min(...r.map((e) => e.xPt)), a = Math.min(...r.map((e) => e.yPt));
	return {
		xPt: i,
		yPt: a,
		widthPt: Math.max(...r.map((e) => e.xPt)) - i,
		heightPt: Math.max(...r.map((e) => e.yPt)) - a
	};
}
function hv(e, t) {
	return Fd(t, e);
}
function gv(e, t) {
	let n = (e) => {
		let n = Id(t, {
			top: e.topPt,
			right: e.rightPt,
			bottom: e.bottomPt,
			left: e.leftPt
		});
		return {
			topPt: n.top,
			rightPt: n.right,
			bottomPt: n.bottom,
			leftPt: n.left
		};
	};
	return {
		...e,
		axes: {
			horizontal: e.axes.vertical,
			vertical: e.axes.horizontal
		},
		geometry: {
			...e.geometry,
			objectFrame: Fd(t, e.geometry.objectFrame),
			inkBounds: Fd(t, e.geometry.inkBounds),
			wrapBounds: e.geometry.wrapBounds ? Fd(t, e.geometry.wrapBounds) : null,
			size: {
				horizontal: e.geometry.size.vertical,
				vertical: e.geometry.size.horizontal
			},
			parentEffectExtent: n(e.geometry.parentEffectExtent),
			wrap: {
				...e.geometry.wrap,
				distances: n(e.geometry.wrap.distances),
				distanceSources: Id(t, e.geometry.wrap.distanceSources),
				effectExtent: n(e.geometry.wrap.effectExtent),
				...e.geometry.wrap.polygon ? { polygon: {
					...e.geometry.wrap.polygon,
					points: e.geometry.wrap.polygon.points.map((e) => Pd(t, e))
				} } : {}
			}
		}
	};
}
function _v(e, t) {
	let n = e.geometry.objectFrame;
	if (n.xPt === t.xPt && n.yPt === t.yPt && n.widthPt === t.widthPt && n.heightPt === t.heightPt) return e;
	let r = n.widthPt === 0 ? 1 : t.widthPt / n.widthPt, i = n.heightPt === 0 ? 1 : t.heightPt / n.heightPt, a = e.geometry.wrap.polygon;
	return {
		...e,
		geometry: {
			...e.geometry,
			objectFrame: t,
			inkBounds: fv(e.geometry.inkBounds, n, t),
			wrapBounds: e.geometry.wrapBounds ? fv(e.geometry.wrapBounds, n, t) : null,
			wrap: {
				...e.geometry.wrap,
				polygon: a ? {
					...a,
					points: a.points.map((e) => ({
						xPt: t.xPt + (e.xPt - n.xPt) * r,
						yPt: t.yPt + (e.yPt - n.yPt) * i
					}))
				} : null
			}
		}
	};
}
function vv(e, t, n) {
	let r = e.group?.resolvedChildFrame;
	if (!r) return t;
	let i = e.extent.widthPt, a = e.extent.heightPt;
	if (e.extent.widthStatus !== "valid" || e.extent.heightStatus !== "valid" || i === null || a === null || i <= 0 || a <= 0) throw Error("resolved grouped anchor requires its authored wp:extent");
	let o = n === void 0 ? t : Fd(n.logicalToPhysical, t), s = o.widthPt / i, c = o.heightPt / a, l = {
		xPt: o.xPt + r.offsetXPt * s,
		yPt: o.yPt + r.offsetYPt * c,
		widthPt: r.widthPt * s,
		heightPt: r.heightPt * c
	};
	return n === void 0 ? l : Fd(n.physicalToLogical, l);
}
function yv(e, t, n = !1) {
	let r = e.axes[t];
	return r.status !== "resolved" || n || r.referenceFrame === "paragraph" || r.referenceFrame === "line" || r.referenceFrame === "character" ? "host" : "page";
}
function bv(e, t, n, r, i, a, o, s, c, l) {
	let u = -1, d;
	for (let t = 0; t < n.length; t += 1) {
		let r = n[t]?.placements.find((t) => t.kind === "anchor-host" && t.anchorOccurrenceId === e);
		if (r?.kind === "anchor-host") {
			u = t, d = r;
			break;
		}
	}
	if (!d || u < 0) return null;
	let f = [...t].sort((e, t) => (e.run.anchorAcquisitionInput?.group?.sourceIndex ?? 0) - (t.run.anchorAcquisitionInput?.group?.sourceIndex ?? 0) || e.runIndex - t.runIndex), p = f[0];
	if (!p?.run.anchorAcquisitionInput) return null;
	let m = n[u], h = i.anchorFrames, g = p.run.anchorAcquisitionInput.behavior, _ = g.layoutInCellStatus === "valid" && g.layoutInCell === !0 && i.anchorCellBounds !== void 0 ? i.anchorCellBounds : null, v = Yg({
		acquisition: p.run.anchorAcquisitionInput,
		frames: {
			page: h?.page ? _ ? {
				...h.page,
				..._
			} : h.page : null,
			margin: h?.margin ? _ ? {
				...h.margin,
				..._
			} : h.margin : null,
			column: h?.column ? _ ? {
				...h.column,
				..._
			} : h.column : null,
			paragraph: {
				xPt: i.placement.paragraphXPt,
				yPt: i.placement.startYPt,
				widthPt: i.placement.availableWidthPt,
				heightPt: Math.max(0, a)
			},
			line: m.bounds,
			character: d.bounds,
			pageParity: h?.pageParity ?? null
		}
	});
	if (v.status !== "resolved") return {
		result: v,
		textBoxes: [],
		hostLineIndex: u,
		hostRange: d.range
	};
	let y = i.environment.verticalPageFrame && h?.page ? jd(h.page, i.environment.pageWritingMode) : void 0, b = y === void 0 ? void 0 : Ld(i.environment.pageWritingMode, y), x = y === void 0 ? v : gv(v, b.physicalToLogical);
	if (g.behindDocStatus !== "valid" || g.relativeHeightStatus !== "valid" || g.behindDoc === null || g.relativeHeight === null) throw Error("resolved anchor frame must retain required CT_Anchor behavior");
	let S = x.geometry.objectFrame, C = y === void 0 ? void 0 : pv(S, b.physicalToLogical), w = C ? {
		...i.environment,
		verticalCJK: !1,
		verticalPageFrame: !1
	} : i.environment, T = [], E = [], D = [], O = [], k = /* @__PURE__ */ new Map(), A = S;
	if (p.run.type === "shape" && p.run.anchorAcquisitionInput.group === null) {
		let t = k_(i.source, p.runIndex), n = C ? mv(S, C) : S, r = kv(p.run, n, {
			id: `${i.id}:anchor-textbox:${e}:${p.runIndex}`,
			source: t,
			flowDomainId: i.flowDomainId,
			context: i.context,
			measurer: i.measurer,
			environment: w,
			input: p.run.textBoxInput,
			acquireCompleteStory: i.acquireCompleteStory,
			...C ? { coordinateSpace: "upright-physical" } : {}
		});
		r && (k.set(p.runIndex, r), A = C ? hv(r.flowBounds, C) : r.flowBounds);
	}
	let j = _v(x, A);
	if (g.allowOverlapStatus !== "valid" || g.allowOverlap === null || g.layoutInCellStatus !== "valid" || g.layoutInCell === null) throw Error("resolved anchor frame must retain overlap and cell behavior");
	let M = j.geometry.wrapBounds, N = !g.allowOverlap, P = g.allowOverlap && i.ordinaryFlow && M !== null;
	if (N || P) {
		let t = yv(j, "vertical", g.layoutInCell && i.anchorCellBounds !== void 0), n = l.filter((e) => !kg(t, g.relativeHeight, e.relativeHeight)), r = (N ? [...c, ...n].filter((t) => t.occurrenceId !== e).map((e) => ({
			occurrenceId: e.occurrenceId,
			bounds: e.bounds
		})) : o.filter((t) => t.anchorOccurrenceId !== e).map((e) => ({
			occurrenceId: e.anchorOccurrenceId ?? e.id,
			bounds: e.bounds
		}))).map((e) => ({
			occurrenceId: e.occurrenceId,
			kind: "drawingml",
			paragraphId: 0,
			bounds: e.bounds,
			exclusionBounds: e.bounds
		})), a = i.anchorFrames?.page, s = N && g.layoutInCell && i.anchorCellBounds ? i.anchorCellBounds.xPt + i.anchorCellBounds.widthPt : a ? a.xPt + a.widthPt : Infinity, u = Hi({
			moving: {
				occurrenceId: e,
				kind: "drawingml",
				paragraphId: 1,
				bounds: A,
				exclusionBounds: M ?? A
			},
			blockers: r,
			avoidance: N ? { kind: "drawingml-normative" } : {
				kind: "word-different-paragraph",
				paragraphId: 1
			},
			rightBoundaryPt: s
		}).displacement;
		if (u.xPt !== 0 || u.yPt !== 0) {
			if (A = Z(A, u), C) C = {
				...C,
				e: C.e + u.xPt,
				f: C.f + u.yPt
			};
			else {
				let e = k.get(p.runIndex);
				e && k.set(p.runIndex, Zm(e, u));
			}
			j = _v(x, A);
		}
	}
	for (let { run: t, runIndex: n } of f) {
		let r = k_(i.source, n), a = t.anchorAcquisitionInput, o = vv(a, A, b), s = C ? mv(o, C) : o;
		if (t.type === "image") T.push({
			kind: "resource",
			resourceKind: "image",
			resourceKey: jn(r, t.imagePath),
			rect: s
		});
		else if (t.type === "chart") T.push({
			kind: "resource",
			resourceKind: "chart",
			resourceKey: j_(r),
			rect: s
		});
		else if (t.type === "unavailableDrawing") T.push({ kind: "noop" }), E.push(N_(t.resourceKind, r));
		else {
			let o = a.group?.resolvedChildFrame, c = fg(o ? {
				...t,
				rotation: o.rotationDeg,
				flipH: o.flipH,
				flipV: o.flipV
			} : t, s, i.environment.layoutServices?.text, t.vmlTextPathInput);
			T.push(c.command), E.push(...A_(c, r));
			let l = `${i.id}:anchor-textbox:${e}:${n}`, u = k.get(n) ?? kv(t, s, {
				id: l,
				source: r,
				flowDomainId: i.flowDomainId,
				context: i.context,
				measurer: i.measurer,
				environment: w,
				input: t.textBoxInput,
				acquireCompleteStory: i.acquireCompleteStory,
				...C ? { coordinateSpace: "upright-physical" } : {}
			});
			u && (D.push(u), O.push(l));
		}
	}
	let ee = {
		kind: "drawing",
		id: `${i.id}:anchor-drawing:${e}`,
		source: k_(i.source, p.runIndex),
		flowDomainId: i.flowDomainId,
		flowBounds: A,
		inkBounds: j.geometry.inkBounds,
		advancePt: 0,
		ordinaryFlow: !1,
		...C ? {
			orientation: "upright-physical",
			transform: C
		} : {},
		commands: T,
		...E.length === 0 ? {} : { diagnostics: Object.freeze(E) },
		anchorLayer: {
			occurrenceId: e,
			behindDoc: g.behindDoc,
			relativeHeight: g.relativeHeight,
			sourceOrder: p.runIndex,
			horizontalOwnership: yv(j, "horizontal", g.layoutInCell && i.anchorCellBounds !== void 0),
			verticalOwnership: yv(j, "vertical", g.layoutInCell && i.anchorCellBounds !== void 0),
			...g.layoutInCell && i.anchorCellBounds ? { cellContainment: !0 } : {}
		},
		...O.length ? { textBoxIds: O } : {}
	}, F = j.geometry.wrapBounds, I = F && j.geometry.wrap.kind !== "none" ? {
		id: `${i.id}:anchor-exclusion:${e}`,
		wrap: j.geometry.wrap.kind,
		...j.geometry.wrap.side ? { wrapSide: j.geometry.wrap.side } : {},
		bounds: F,
		polygon: j.geometry.wrap.polygon?.points ?? dv(F),
		anchorOccurrenceId: e,
		verticalOwnership: yv(j, "vertical", g.layoutInCell && i.anchorCellBounds !== void 0)
	} : void 0, L = {
		occurrenceId: e,
		bounds: A,
		horizontalOwnership: yv(j, "horizontal", g.layoutInCell && i.anchorCellBounds !== void 0),
		verticalOwnership: yv(j, "vertical", g.layoutInCell && i.anchorCellBounds !== void 0),
		...g.relativeHeight === null ? {} : { relativeHeight: g.relativeHeight }
	};
	return {
		result: j,
		drawing: ee,
		exclusion: I,
		collision: L,
		textBoxes: D,
		...g.layoutInCell && i.anchorCellBounds ? { cellContainmentBounds: A } : {},
		hostLineIndex: u,
		hostRange: d.range
	};
}
function xv(e, t) {
	let n = t.bidi === !0, r = t.runs.some((e) => e.type === "text" && !!e.ruby), i = t.runs.some((e) => e.type === "text" && Cr.test(e.text));
	return {
		...e,
		physicalIndentLeftPt: n ? t.indentRight : t.indentLeft,
		physicalIndentRightPt: n ? t.indentLeft : t.indentRight,
		firstIndentPt: t.indentFirst,
		lineSpacing: t.lineSpacing,
		spaceBeforePt: t.spaceBefore,
		spaceAfterPt: t.spaceAfter,
		baseRtl: n,
		isJustified: Cs(t.alignment),
		stretchLastLine: ws(t.alignment),
		tabStops: [...t.tabStops],
		hasRuby: r,
		hasEastAsianText: i
	};
}
function Sv(e) {
	return e === "vert" || e === "vert270" || e === "eaVert" || e === "mongolianVert" ? e : void 0;
}
function Cv(e, t, n) {
	let r = Math.max(0, t - n);
	return e === "b" ? r : e === "ctr" ? r / 2 : 0;
}
function wv(e, t, n, r) {
	let i = t === "eaVert" || t === "mongolianVert", a = e.lines.map((e) => {
		let a = t === "mongolianVert" ? e.placements.reduce((t, n) => n.kind === "text" && n.ruby ? Math.max(t, e.baselinePt - Math.min(e.baselinePt, ...n.ruby.paintOps.map((e) => e.origin.yPt))) : t, 0) : 0, o = (t === "mongolianVert" ? 2 * n.yPt + n.heightPt - e.baselinePt + r.bottomPt - r.leftPt + a : e.baselinePt) - e.baselinePt, s = e.bounds.yPt + o, c = e.placements.map((e) => {
			if (e.kind !== "text") return "bounds" in e && e.bounds ? {
				...e,
				bounds: {
					...e.bounds,
					yPt: e.bounds.yPt + o
				}
			} : e;
			let t = i ? e.clusters.map((t) => {
				let n = e.text.slice(t.range.start - e.range.start, t.range.end - e.range.start), r = e.paintOps.find((e) => e.range.start <= t.range.start && e.range.end >= t.range.end) ?? e.paintOps[0], i = Cr.test(n);
				return {
					...r,
					text: n,
					range: t.range,
					offset: i ? {
						xPt: t.offset.xPt + t.advancePt / 2,
						yPt: t.offset.yPt
					} : t.offset,
					glyphOrientation: i ? "upright" : "sideways"
				};
			}) : e.paintOps;
			return Yv({
				...e,
				paintOps: t
			}, o);
		});
		return {
			...e,
			bounds: {
				...e.bounds,
				yPt: s
			},
			baselinePt: e.baselinePt + o,
			placements: c
		};
	});
	return {
		...e,
		lines: a
	};
}
function Tv(e, t) {
	let n = (e, n) => e.kind === "paragraph" ? wv(e, t === "mongolianVert" ? "eaVert" : t, n, {
		topPt: 0,
		rightPt: 0,
		bottomPt: 0,
		leftPt: 0
	}) : Tv(e, t), r = {
		...e,
		rows: e.rows.map((e) => ({
			...e,
			cells: e.cells.map((e) => ({
				...e,
				blocks: e.blocks.map((t) => ({
					...t,
					layout: n(t.layout, e.contentBounds)
				}))
			}))
		}))
	}, i = /* @__PURE__ */ new Map(), a = (e) => {
		let n = i.get(e);
		if (n) return n;
		let r = {
			...e,
			child: Tv(e.child, t)
		};
		return i.set(e, r), r;
	}, o = e.floatingTables?.map(a), s = e.resolvedFloatingTables?.map((e) => {
		let t = a(e.source);
		return {
			...e,
			source: t,
			child: t.child
		};
	});
	return {
		...r,
		...o ? { floatingTables: o } : {},
		...s ? { resolvedFloatingTables: s } : {}
	};
}
function Ev(e, t, n, r) {
	return {
		...e,
		blocks: e.blocks.map((e) => {
			if (e.kind === "paragraph") return wv(e, t, n, r);
			if (e.kind === "table") return Tv(e, t);
			throw Error(`Text-box story contains unsupported retained node: ${e.kind}`);
		})
	};
}
function Dv(e, t, n = !0) {
	if (t === 0) return e;
	let r = {
		xPt: 0,
		yPt: t
	};
	return {
		...e,
		flowBounds: Z(e.flowBounds, r),
		inkBounds: Z(e.inkBounds, r),
		...e.clipBounds ? { clipBounds: n ? Z(e.clipBounds, r) : e.clipBounds } : {},
		blocks: e.blocks.map((e) => {
			if (e.kind === "paragraph") return Ym(e, r);
			if (e.kind === "table") return Ov(e, r);
			throw Error(`Text-box story contains unsupported retained node: ${e.kind}`);
		})
	};
}
function Ov(e, t) {
	let n = eh(e, t), r = /* @__PURE__ */ new Map(), i = (e) => {
		let n = r.get(e);
		if (n) return n;
		let i = {
			...e,
			anchorBounds: Z(e.anchorBounds, t),
			...e.columnBounds ? { columnBounds: Z(e.columnBounds, t) } : {},
			child: Ov(e.child, t)
		};
		return r.set(e, i), i;
	}, a = e.floatingTables?.map(i), o = e.resolvedFloatingTables?.map((e) => {
		let n = i(e.source);
		return {
			...e,
			xPt: e.xPt + t.xPt,
			yPt: e.yPt + t.yPt,
			bounds: Z(e.bounds, t),
			exclusionBounds: Z(e.exclusionBounds, t),
			source: n,
			child: n.child
		};
	});
	return {
		...n,
		...a ? { floatingTables: a } : {},
		...o ? { resolvedFloatingTables: o } : {}
	};
}
function kv(e, t, n) {
	let r = n.source, i = n.input ?? {
		kind: "compatibility",
		source: {
			story: "textbox",
			storyInstance: `${r.story}:${r.storyInstance}:${r.path.join(".")}`,
			path: []
		},
		paragraphs: zn(e, {
			story: "textbox",
			storyInstance: `${r.story}:${r.storyInstance}:${r.path.join(".")}`,
			path: []
		})
	}, a = i.source, o = i.kind === "complete" ? i.blocks.length : i.paragraphs.length;
	if (o === 0) return;
	let s = Sv(e.textVert), c = s ? {
		xPt: -t.heightPt / 2,
		yPt: -t.widthPt / 2,
		widthPt: t.heightPt,
		heightPt: t.widthPt
	} : t, l = i.kind === "compatibility" ? i.paragraphs : Object.freeze([]), u = {
		topPt: e.textInsetT ?? 0,
		rightPt: e.textInsetR ?? 0,
		bottomPt: e.textInsetB ?? 0,
		leftPt: e.textInsetL ?? 0
	}, d = {
		xPt: c.xPt + u.leftPt,
		yPt: c.yPt + u.topPt,
		widthPt: Math.max(0, c.widthPt - u.leftPt - u.rightPt),
		heightPt: Math.max(0, c.heightPt - u.topPt - u.bottomPt)
	}, f;
	if (i.kind === "complete") {
		if (!n.acquireCompleteStory) throw Error("Complete text-box content requires the shared story acquisition adapter");
		f = n.acquireCompleteStory({
			source: a,
			container: {
				id: `${n.id}:story`,
				kind: "textbox",
				bounds: d,
				capacity: "unbounded"
			},
			blocks: i.blocks,
			coordinateSpace: n.coordinateSpace ?? "section-logical"
		});
	}
	let p = c.yPt + u.topPt, m = null, h = l.map((t, r) => {
		let i = t.runs.map((t) => Er({
			text: t.text,
			fontSizePt: t.fontSizePt,
			color: t.color?.slice(1) ?? null,
			fontFamily: t.fontFamily ?? null,
			fontFamilyEastAsia: t.fontFamilyEastAsia ?? null,
			bold: t.bold,
			italic: t.italic,
			ruby: t.ruby
		}, e.textVert)), a = Math.max(0, c.widthPt - u.leftPt - u.rightPt - t.indentLeftPt - t.indentRightPt - Math.max(0, t.indentFirstPt)), o = s ? t.image?.heightPt ?? 0 : t.image?.widthPt ?? 0, l = s ? t.image?.widthPt ?? 0 : t.image?.heightPt ?? 0, f = o > a && o > 0 ? a / o : 1, h = t.image ? [{
			type: "image",
			imagePath: t.image.imagePath,
			mimeType: t.image.mimeType,
			...t.image.svgImagePath ? { svgImagePath: t.image.svgImagePath } : {},
			widthPt: o > 0 ? o * f : a,
			heightPt: l > 0 ? l * f : a,
			anchor: !1
		}] : i, g = {
			alignment: t.alignment,
			indentLeft: t.indentLeftPt,
			indentRight: t.indentRightPt,
			indentFirst: t.indentFirstPt,
			spaceBefore: t.spacing.beforePt,
			spaceAfter: t.spacing.afterPt,
			lineSpacing: t.lineSpacing,
			numbering: t.numbering ?? null,
			numberingMarkerShapeInput: t.numberingMarkerShapeInput,
			tabStops: [...t.tabStops],
			bidi: t.bidi,
			contextualSpacing: t.contextualSpacing,
			styleId: t.styleId,
			runs: h
		}, _ = xv(n.context, g), v = Xg(m, t, m?.spacing.afterPt ?? 0, t.spacing.beforePt);
		p += v;
		let y = Vv(g, {
			id: `${n.id}:paragraph:${r}`,
			source: t.source,
			flowDomainId: `${n.flowDomainId}:textbox`,
			ordinaryFlow: !0,
			context: _,
			placement: {
				startYPt: p,
				paragraphXPt: c.xPt + u.leftPt,
				availableWidthPt: Math.max(0, c.widthPt - u.leftPt - u.rightPt),
				maximumYPt: c.yPt + c.heightPt - u.bottomPt,
				suppressSpaceBefore: !0
			},
			measurer: n.measurer,
			environment: n.environment,
			exclusions: []
		});
		return p += y.advancePt - y.spacing.afterPt, m = t, s ? wv(y, s, d, u) : y;
	}), g = f ? Math.max(0, f.advancePt + u.topPt + u.bottomPt) : Math.max(0, p - c.yPt + u.bottomPt), _ = e.textAutofit === "sp" && o > 0 && (!s || l.every((e) => e.image === void 0)) && Number.isFinite(g) && g > 0 ? s ? {
		...t,
		widthPt: g
	} : {
		...t,
		heightPt: g
	} : t, v = s ? {
		xPt: -_.heightPt / 2,
		yPt: -_.widthPt / 2,
		widthPt: _.heightPt,
		heightPt: _.widthPt
	} : _;
	if (s && _.widthPt !== t.widthPt && s !== "mongolianVert") {
		let e = v.yPt - c.yPt;
		h = h.map((t) => Zv(t, e));
	}
	let y = {
		xPt: v.xPt + u.leftPt,
		yPt: v.yPt + u.topPt,
		widthPt: Math.max(0, v.widthPt - u.leftPt - u.rightPt),
		heightPt: Math.max(0, v.heightPt - u.topPt - u.bottomPt)
	}, b = mf(h.map((e) => e.flowBounds)) ?? {
		xPt: y.xPt,
		yPt: y.yPt,
		widthPt: 0,
		heightPt: 0
	}, x = mf(h.map((e) => e.inkBounds)) ?? {
		xPt: y.xPt,
		yPt: y.yPt,
		widthPt: 0,
		heightPt: 0
	}, S = f ?? {
		story: "textbox",
		flowBounds: b,
		inkBounds: x,
		clipBounds: y,
		blocks: h,
		advancePt: Math.max(0, g - u.topPt - u.bottomPt),
		diagnostics: []
	}, C = Eg(S);
	return f && s && (S = Ev(Dv(S, v.yPt - c.yPt), s, y, u)), S = Dv(S, Cv(e.textAnchor, y.heightPt, C), !1), Fn({
		kind: "textbox",
		id: n.id,
		source: l[0]?.source ?? a,
		flowDomainId: `${n.flowDomainId}:textbox`,
		flowBounds: _,
		inkBounds: _,
		...e.defaultTextColor ? { defaultTextColor: `#${e.defaultTextColor.replace(/^#/u, "")}` } : {},
		...e.textAutofit === "none" ? { clipBounds: y } : {},
		advancePt: 0,
		ordinaryFlow: !1,
		story: S,
		transform: s ? {
			a: 0,
			b: s === "vert270" ? -1 : 1,
			c: s === "vert270" ? 1 : -1,
			d: 0,
			e: _.xPt + _.widthPt / 2,
			f: _.yPt + _.heightPt / 2
		} : {
			a: 1,
			b: 0,
			c: 0,
			d: 1,
			e: 0,
			f: 0
		},
		writingMode: e.textVert === "vert270" ? "vertical-lr" : e.textVert ? "vertical-rl" : "horizontal-tb",
		insets: u,
		contentBounds: v,
		...s ? { verticalMode: s } : {}
	});
}
var Av = class extends J {
	reason;
	states;
	occurrenceCapacity;
	constructor(e, t, n) {
		super("NON_CONVERGENCE", `parser-owned paragraph anchor reflow did not converge (${e}; ${n} occurrences; ${t.length} states)`), this.name = "ParagraphAnchorReflowNonConvergenceError", this.reason = e, this.states = Object.freeze([...t]), this.occurrenceCapacity = n;
	}
};
function jv(e, t) {
	if (t.length === 0) return e.placement;
	if (e.placement.wrap) throw Error("Conflicting paragraph wrap authorities: placement.wrap and effective exclusions");
	let n = e.anchorFrames?.page, r = Dh(t.map((e, t) => ({
		kind: "shape",
		mode: e.wrap === "topAndBottom" ? "topAndBottom" : "square",
		authoredWrap: e.wrap,
		wrapPolygon: e.polygon,
		imageKey: e.id,
		imageX: e.bounds.xPt,
		imageY: e.bounds.yPt,
		imageW: e.bounds.widthPt,
		imageH: e.bounds.heightPt,
		xLeft: e.bounds.xPt,
		xRight: e.bounds.xPt + e.bounds.widthPt,
		yTop: e.bounds.yPt,
		yBottom: e.bounds.yPt + e.bounds.heightPt,
		side: e.wrapSide ?? "bothSides",
		distLeft: 0,
		distRight: 0,
		distTop: 0,
		distBottom: 0,
		paraId: t
	})), {
		xLeftPt: n?.xPt ?? e.placement.paragraphXPt,
		xRightPt: n ? n.xPt + n.widthPt : e.placement.paragraphXPt + e.placement.availableWidthPt,
		readingDirection: e.context.baseRtl ? "rtl" : "ltr"
	});
	return {
		...e.placement,
		wrap: r
	};
}
function Mv(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e.exclusions) {
		let e = r.anchorOccurrenceId;
		if (!(!e || !t.has(e))) {
			if (n.has(e)) throw Error(`Paragraph anchor occurrence produced duplicate exclusions: ${e}`);
			n.set(e, r);
		}
	}
	return Object.freeze([...n.values()]);
}
function Nv(e) {
	return On("paragraph-effective-wrap-exclusions", e.map((e) => ({
		id: e.id,
		...e.anchorOccurrenceId === void 0 ? {} : { occurrenceId: e.anchorOccurrenceId },
		wrap: e.wrap,
		...e.wrapSide === void 0 ? {} : { wrapSide: e.wrapSide },
		bounds: e.bounds,
		polygon: e.polygon,
		...e.verticalOwnership === void 0 ? {} : { verticalOwnership: e.verticalOwnership }
	})));
}
function Pv(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e) {
		let e = n.anchorOccurrenceId;
		if (e) {
			if (t.has(e)) throw Error(`Duplicate external paragraph exclusion occurrence: ${e}`);
			t.add(e);
		}
	}
	return t;
}
function Fv(e, t) {
	let n = Pv(e);
	return Object.freeze([...e, ...t.filter((e) => !e.anchorOccurrenceId || !n.has(e.anchorOccurrenceId))]);
}
function Iv(e, t) {
	let n = /* @__PURE__ */ new Set();
	for (let t of e) {
		if (n.has(t.occurrenceId)) throw Error(`Duplicate external anchor collision occurrence: ${t.occurrenceId}`);
		n.add(t.occurrenceId);
	}
	return Object.freeze([...e, ...t.filter((e) => !n.has(e.occurrenceId))]);
}
function Lv(e, t, n, r) {
	let i = n.environment.layoutServices, a = n.environment.verticalGlyphMeasurement, o = n.anchorFrames, s = t.runs.some(uv), c = t.runs.some((e) => e.type === "shape" && e.textBoxInput?.kind === "complete"), { wrap: l, ...u } = n.placement, d = n.context, f = n.environment;
	return `paragraph-acquisition-v1:${JSON.stringify([
		n.id,
		[
			n.source.story,
			n.source.storyInstance,
			n.source.path
		],
		n.flowDomainId,
		n.ordinaryFlow,
		[
			u.startYPt,
			u.paragraphXPt,
			u.availableWidthPt,
			u.maximumYPt,
			u.suppressSpaceBefore,
			l ? e.objectIdentity(l) : null
		],
		[
			d.lineGrid.active,
			d.lineGrid.pitchPt,
			d.characterGrid.active,
			d.characterGrid.deltaPt,
			d.physicalIndentLeftPt,
			d.physicalIndentRightPt,
			d.firstIndentPt,
			d.lineSpacing ? [
				d.lineSpacing.value,
				d.lineSpacing.rule,
				d.lineSpacing.explicit ?? null
			] : null,
			d.spaceBeforePt,
			d.spaceAfterPt,
			d.baseRtl,
			d.isJustified,
			d.stretchLastLine,
			d.tabStops.map((e) => [
				e.pos,
				e.alignment,
				e.leader
			]),
			d.hasRuby,
			d.hasEastAsianText,
			[
				d.kinsoku.enabled,
				[...d.kinsoku.lineStartForbidden].sort((e, t) => e - t),
				[...d.kinsoku.lineEndForbidden].sort((e, t) => e - t)
			],
			d.defaultTabPt,
			d.overflowPunct !== !1,
			d.numberingMarkerGeometry ? JSON.stringify(d.numberingMarkerGeometry) : null,
			d.mathDefJc ?? null
		],
		[e.objectIdentity(n.measurer.context), e.objectIdentity(n.measurer.fontFamilyClasses)],
		[
			f.pageIndex,
			f.totalPages,
			f.displayPageNumber ?? null,
			f.pageNumberFormat ?? null,
			f.currentDateMs ?? null,
			f.noteNumbers ? [...f.noteNumbers.entries()].sort(([e], [t]) => e.localeCompare(t)) : null,
			f.noteReferenceNumber ?? null,
			f.pageWritingMode,
			f.verticalCJK ?? null,
			f.verticalPageFrame ?? null,
			f.documentHasEastAsianText,
			f.useFeLayout ?? null,
			f.characterSpacingControl ?? null,
			f.resolvedLocalFonts ? e.objectIdentity(f.resolvedLocalFonts) : null,
			i?.text.fingerprint ?? null,
			i?.images.fingerprint ?? null,
			i?.math.fingerprint ?? null,
			i?.verticalGlyphFingerprint ?? null,
			a?.fingerprint ?? null
		],
		JSON.stringify(n.exclusions),
		s ? JSON.stringify(n.anchorCollisions ?? []) : null,
		r ? JSON.stringify(r) : null,
		n.paragraphBorderEdges ? [n.paragraphBorderEdges.top, n.paragraphBorderEdges.bottom] : null,
		n.trailingExtentPt ?? null,
		n.containerShading ?? null,
		n.continuesFromPrevious ?? null,
		n.sourceRangeStart ?? null,
		o ? [
			o.page ? [
				o.page.xPt,
				o.page.yPt,
				o.page.widthPt,
				o.page.heightPt
			] : null,
			o.margin ? [
				o.margin.xPt,
				o.margin.yPt,
				o.margin.widthPt,
				o.margin.heightPt
			] : null,
			o.column ? [
				o.column.xPt,
				o.column.yPt,
				o.column.widthPt,
				o.column.heightPt
			] : null,
			o.pageParity
		] : null,
		s ? JSON.stringify(n.anchorCellBounds ?? null) : null,
		c && n.acquireCompleteStory ? e.objectIdentity(n.acquireCompleteStory) : null
	])}`;
}
function Rv(e) {
	let t = e.src ? Object.freeze({ ...e.src }) : void 0;
	return "text" in e ? Object.freeze({
		...e,
		...t ? { src: t } : {},
		...e.shapedClusters ? { shapedClusters: Object.freeze(e.shapedClusters.map((e) => Object.freeze({
			...e,
			range: Object.freeze({ ...e.range })
		}))) } : {},
		...e.selectedFaceInkBounds ? { selectedFaceInkBounds: Object.freeze({ ...e.selectedFaceInkBounds }) } : {},
		...e.ruby ? { ruby: Object.freeze({ ...e.ruby }) } : {},
		...e.border ? { border: Object.freeze({ ...e.border }) } : {},
		...e.revision ? { revision: Object.freeze({ ...e.revision }) } : {},
		...e.hyperlink ? { hyperlink: Object.freeze({ ...e.hyperlink }) } : {},
		...e.seaBreaks ? { seaBreaks: Object.freeze([...e.seaBreaks]) } : {}
	}) : "imagePath" in e ? Object.freeze({
		...e,
		...t ? { src: t } : {},
		...e.srcRect ? { srcRect: Object.freeze({ ...e.srcRect }) } : {},
		...e.duotone ? { duotone: Object.freeze({ ...e.duotone }) } : {}
	}) : "isTab" in e ? Object.freeze({
		...e,
		...t ? { src: t } : {},
		...e.ptab ? { ptab: Object.freeze({ ...e.ptab }) } : {}
	}) : Object.freeze({
		...e,
		...t ? { src: t } : {}
	});
}
function zv(e) {
	return Object.freeze({
		...e,
		layout: Object.freeze({
			...e.layout,
			segments: Object.freeze(e.layout.segments.map(Rv)),
			...e.layout.consumedEnd ? { consumedEnd: Object.freeze({ ...e.layout.consumedEnd }) } : {}
		})
	});
}
function Bv(e, t, n) {
	let r = t.environment.layoutServices ? Ju(t.environment.layoutServices) : void 0, i = r ? Lv(r, e, t, n) : void 0, a = i === void 0 ? void 0 : r.get(e, i);
	if (a) return a;
	let o = Pv(t.exclusions), s = new Set(e.runs.flatMap((e) => uv(e) ? [e.anchorAcquisitionInput.occurrenceId] : []));
	for (let e of o) s.delete(e);
	let c = s.size, l = Object.freeze([]), u = Fv(t.exclusions, l);
	try {
		let a = Ma({
			seedState: Nv(u),
			step: (r) => {
				let i = Fv(t.exclusions, r?.ownedExclusions ?? l), a = Ah(e, t.context, jv(t, i), t.measurer, {
					...t.environment,
					paragraphMarkShapeInput: e.paragraphMarkShapeInput
				}, n), o = Gv(e, t, a), c = Mv(o, s), u = Nv(Fv(t.exclusions, c));
				if (Nv(o.exclusions) !== u) throw Error("Paragraph retained exclusions differ from the measured exclusion authority");
				return Object.freeze({
					measured: a,
					layout: o,
					ownedExclusions: c,
					state: u
				});
			},
			stateOf: (e) => e.state,
			limit: 16
		}).value, o = Object.freeze({
			...a.measured,
			lines: Object.freeze(a.measured.lines.map(zv)),
			placement: Object.freeze({ ...a.measured.placement })
		}), c = Object.freeze({
			measured: o,
			layout: a.layout
		});
		return i !== void 0 && r.set(e, i, c), c;
	} catch (e) {
		throw e instanceof ja ? new Av(e.reason, e.states, c) : e;
	}
}
function Vv(e, t) {
	return Bv(e, t).layout;
}
var Hv = /* @__PURE__ */ new WeakMap();
function Uv(e) {
	return e === void 0 ? null : e instanceof Date ? { date: e.toISOString() } : e instanceof Set ? { set: [...e].map(Uv).sort((e, t) => JSON.stringify(e).localeCompare(JSON.stringify(t))) } : e instanceof Map ? { map: [...e.entries()].map(([e, t]) => [Uv(e), Uv(t)]).sort((e, t) => JSON.stringify(e[0]).localeCompare(JSON.stringify(t[0]))) } : Array.isArray(e) ? e.map(Uv) : e && typeof e == "object" ? Object.fromEntries(Object.entries(e).map(([e, t]) => [e, Uv(t)])) : e;
}
function Wv(e, t) {
	if (t.contexts.length !== e.members.length || t.inputs.length !== e.members.length || t.borderEdges.length !== e.members.length || t.borderExtentsPt.length !== e.members.length) throw Error("Frame acquisition metadata must align with every group member");
	if (!Number.isFinite(t.maximumWidthPt) || t.maximumWidthPt < 0) throw RangeError("Frame maximumWidthPt must be finite and non-negative");
	let n = Hv.get(t.acquisitionSession);
	n || (n = /* @__PURE__ */ new Map(), Hv.set(t.acquisitionSession, n));
	let r = On("w:frame-acquisition", [
		e.id,
		t.placementSignature,
		t.maximumWidthPt,
		t.environment.pageIndex,
		t.environment.totalPages,
		t.environment.displayPageNumber ?? null,
		t.environment.pageNumberFormat ?? null,
		t.environment.currentDateMs ?? null,
		t.environment.documentHasEastAsianText,
		t.environment.layoutServices?.text.fingerprint ?? null,
		t.environment.layoutServices?.images.fingerprint ?? null,
		t.environment.layoutServices?.math.fingerprint ?? null,
		t.environment.layoutServices?.verticalGlyphFingerprint ?? null,
		Uv(t.contexts),
		Uv(t.inputs),
		Uv(t.borderEdges),
		Uv(t.borderExtentsPt),
		t.containerShading ?? null,
		Uv(t.anchorFrames)
	]), i = n.get(r);
	if (i) return i;
	let a = e.framePr, o = a.w == null ? Math.max(0, ...e.members.map((e, n) => Gs(e, t.contexts[n], t.maximumWidthPt, t.measurer, t.environment, H_(t.inputs[n], t.contexts[n], t)))) : Math.max(0, a.w), s = Math.max(1, o), c = (() => {
		let n = c_(`body-frame:${e.id}`), r = 0, i = null, a = 0, o = 0, c = [];
		return e.members.forEach((l, u) => {
			let d = t.contexts[u], f = Math.max(Xg(i, l, a, d.spaceBeforePt), o), p = {
				startYPt: r + f,
				paragraphXPt: 0,
				availableWidthPt: s,
				maximumYPt: Infinity,
				suppressSpaceBefore: !0
			}, m = t.borderExtentsPt[u] ?? 0, h = {
				story: "body",
				storyInstance: "body",
				path: [e.sourceIndices[u]]
			}, { measured: g, layout: _ } = Bv(t.inputs[u], {
				id: `body-frame:${e.id}:${u}`,
				source: h,
				flowDomainId: `body-frame:${e.id}`,
				ordinaryFlow: !1,
				context: d,
				placement: p,
				measurer: t.measurer,
				environment: t.environment,
				exclusions: n.exclusions,
				anchorCollisions: n.collisions,
				containerShading: t.containerShading,
				paragraphBorderEdges: t.borderEdges[u],
				trailingExtentPt: Math.max(d.spaceAfterPt, m),
				anchorFrames: t.anchorFrames
			});
			n = d_(n, _), c.push({
				paragraph: l,
				fragment: _,
				source: h
			}), r = g.contentEndYPt, i = l, a = g.requestedSpaceAfterPt, o = m;
		}), {
			heightPt: Math.max(0, r + Math.max(a, o)),
			members: c
		};
	})(), l = t.place(o, c.heightPt), u = Object.freeze(c.members.map((e) => {
		let t = Ym(e.fragment, {
			xPt: l.bounds.xPt,
			yPt: l.bounds.yPt
		}), n = O_(a.hRule === "exact" && a.h != null ? {
			...t,
			clipBounds: l.bounds
		} : t), r = Object.freeze({
			...n,
			advancePt: 0
		});
		return Object.freeze({
			...e,
			fragment: r
		});
	})), d = Object.freeze({
		box: Object.freeze({
			bounds: l.bounds,
			exclusionBounds: l.exclusionBounds,
			exclusionId: `frame:${e.id}`
		}),
		members: u
	});
	return n.set(r, d), d;
}
function Gv(e, t, n) {
	let r = t.continuesFromPrevious ? {
		...t.context,
		firstIndentPt: 0
	} : t.context, i = t.placement.paragraphXPt + r.physicalIndentLeftPt, a = t.placement.availableWidthPt - r.physicalIndentLeftPt - r.physicalIndentRightPt, o = ev(e, n), s = t.continuesFromPrevious ? void 0 : H_(e, r, t), c = nv(n, e, i, a, t.source, r, o, s, t.environment.layoutServices?.text, t.environment.verticalGlyphMeasurement, t.environment.verticalPageFrame);
	t.sourceRangeStart !== void 0 && (c = iv(c, t.sourceRangeStart)), s && n.markOnly && c.length === 0 && (s.markerText !== "" || e.numbering?.picBulletImagePath) && (c = [av(n, e, i, a, r)]);
	let l = [], u = [], d = [], f = [], p = [], m = [], h = [], g = e.runs.map((e, t) => e.type === "break" ? {
		kind: "break",
		breakKind: e.breakType,
		offset: o.runStarts[t] ?? 0
	} : void 0).filter((e) => e !== void 0), _ = /* @__PURE__ */ new Map();
	e.runs.forEach((e, t) => {
		if (!uv(e)) return;
		let n = _.get(e.anchorAcquisitionInput.occurrenceId) ?? [];
		n.push({
			run: e,
			runIndex: t
		}), _.set(e.anchorAcquisitionInput.occurrenceId, n);
	});
	for (let [r, i] of _) {
		let a = bv(r, i, c, e, t, n.contentEndYPt - t.placement.startYPt, t.exclusions, p, t.anchorCollisions ?? [], m);
		a && (f.push(a.result), a.cellContainmentBounds && h.push(a.cellContainmentBounds), a.drawing && (u.push(a.drawing), d.push(...a.textBoxes), a.exclusion && p.push(a.exclusion), a.collision && m.push(a.collision), c[a.hostLineIndex] && (c = c.map((e, t) => t === a.hostLineIndex ? {
			...e,
			placements: [...e.placements, {
				kind: "drawing",
				range: a.hostRange,
				drawingId: a.drawing.id,
				bounds: a.drawing.inkBounds,
				advancePt: 0
			}]
		} : e))));
	}
	if (s && c[0]) {
		let n = W_(s, e, t.context, i, a, c[0]);
		n.length > 0 && (c = [{
			...c[0],
			placements: [...n, ...c[0].placements]
		}, ...c.slice(1)]);
	}
	if (e.runs.forEach((e, n) => {
		let r = k_(t.source, n);
		if (e.type === "unavailableDrawing" && e.anchorAcquisitionInput === void 0) {
			let i = M_(t.source, n), a = c.flatMap((e) => e.placements).find((e) => e.kind === "drawing" && e.drawingId === i);
			a?.kind === "drawing" && u.push({
				kind: "drawing",
				id: i,
				source: r,
				flowDomainId: t.flowDomainId,
				flowBounds: a.bounds,
				inkBounds: a.bounds,
				advancePt: 0,
				ordinaryFlow: !1,
				commands: Object.freeze([{ kind: "noop" }]),
				diagnostics: Object.freeze([N_(e.resourceKind, r)])
			});
		}
		if (e.type === "image" && l.push({
			kind: "image",
			resourceKey: jn(r, e.imagePath),
			intrinsicSize: {
				widthPt: e.widthPt,
				heightPt: e.heightPt
			}
		}), e.type === "chart" && l.push({
			kind: "chart",
			resourceKey: j_(r),
			intrinsicSize: {
				widthPt: e.widthPt,
				heightPt: e.heightPt
			}
		}), e.type === "math" && l.push({
			kind: "math",
			resourceKey: e.resourceKey ?? On("math-resource", r),
			intrinsicSize: {
				widthPt: c.flatMap((e) => e.placements).find((e) => e.kind === "resource" && e.resourceKind === "math")?.bounds?.widthPt ?? 0,
				heightPt: e.fontSize
			}
		}), (e.type === "image" || e.type === "chart") && !t.continuesFromPrevious) {
			let r = lv(e, t, n);
			if (r) {
				u.push(r);
				let e = c[0];
				e && (c = [{
					...e,
					placements: [...e.placements, {
						kind: "drawing",
						range: {
							start: o.runStarts[n] ?? 0,
							end: (o.runStarts[n] ?? 0) + (o.runLengths[n] ?? 1)
						},
						drawingId: r.id,
						bounds: r.inkBounds,
						advancePt: 0
					}]
				}, ...c.slice(1)]);
			}
		}
		if (e.type === "shape" && !e.anchorAcquisitionInput && !t.continuesFromPrevious) {
			let i = sv(e, t), a = `${t.id}:textbox:${n}`, s = kv(e, i, {
				id: a,
				source: r,
				flowDomainId: t.flowDomainId,
				context: t.context,
				measurer: t.measurer,
				environment: t.environment,
				input: e.textBoxInput,
				acquireCompleteStory: t.acquireCompleteStory
			}), l = cv(e, s?.flowBounds ?? i, t, n);
			s && (d.push(s), l = {
				...l,
				textBoxIds: [a]
			}), u.push(l);
			let f = c[0];
			f && (c = [{
				...f,
				placements: [...f.placements, {
					kind: "drawing",
					range: {
						start: o.runStarts[n] ?? 0,
						end: (o.runStarts[n] ?? 0) + (o.runLengths[n] ?? 1)
					},
					drawingId: l.id,
					bounds: l.inkBounds,
					advancePt: 0
				}]
			}, ...c.slice(1)]);
		}
	}), e.numbering?.picBulletImagePath && !t.continuesFromPrevious && l.push({
		kind: "picture-bullet",
		resourceKey: jn(t.source, e.numbering.picBulletImagePath),
		intrinsicSize: {
			widthPt: e.numbering.picBulletWidthPt ?? e.numberingMarkerShapeInput?.fontSizePt ?? 0,
			heightPt: e.numbering.picBulletHeightPt ?? e.numberingMarkerShapeInput?.fontSizePt ?? 0
		}
	}), e.numbering?.picBulletImagePath && c[0] && !t.continuesFromPrevious) {
		if (!s) throw Error("Picture-bullet acquisition requires resolved marker font geometry");
		let n = e.numbering.picBulletWidthPt ?? s.markerWidthPt, r = e.numbering.picBulletHeightPt ?? e.numberingMarkerShapeInput?.fontSizePt;
		if (r === void 0) throw Error("Picture-bullet acquisition requires resolved marker height");
		let o = Es({
			baseRtl: t.context.baseRtl,
			alignedLeadingEdgePt: U_(s, t.context, i, a, c[0]),
			authoredFirstIndentPt: e.indentFirst,
			markerShiftPt: s.markerShiftPt,
			markerWidthPt: n
		});
		c = [{
			...c[0],
			placements: [{
				kind: "resource",
				resourceKind: "picture-bullet",
				range: {
					start: -1,
					end: 0
				},
				resourceKey: jn(t.source, e.numbering.picBulletImagePath),
				bounds: {
					xPt: o,
					yPt: c[0].baselinePt - r,
					widthPt: n,
					heightPt: r
				},
				advancePt: 0
			}, ...c[0].placements]
		}, ...c.slice(1)];
	}
	c = K_(c, e.shading, t.containerShading);
	let v = n.contentEndYPt - n.contentStartYPt, y = t.paragraphBorderEdges ?? {
		top: "top",
		bottom: "bottom"
	}, b = J_(e, c, i, a, n.contentStartYPt, v, y), x = e.borders ? [
		...y.top === "none" ? [] : [[y.top, e.borders[y.top]]],
		["right", e.borders.right],
		...y.bottom === "none" ? [] : [["bottom", e.borders.bottom]],
		["left", e.borders.left]
	] : [], S = e.borders ? x.flatMap(([e, t]) => {
		if (!q_(t)) return [];
		let n = e === "top" || e === "between" || e === "bottom", r = e === "right" || e === "bottom", i = n ? b.yPt + (r ? b.heightPt : 0) : b.xPt + (r ? b.widthPt : 0);
		return [{
			edge: e,
			from: n ? {
				xPt: b.xPt,
				yPt: i
			} : {
				xPt: i,
				yPt: b.yPt
			},
			to: n ? {
				xPt: b.xPt + b.widthPt,
				yPt: i
			} : {
				xPt: i,
				yPt: b.yPt + b.heightPt
			},
			color: t.color ? `#${t.color}` : "#000000",
			widthPt: t.width,
			...Bd(t.style, t.width)
		}];
	}) : [], C = t.trailingExtentPt ?? n.requestedSpaceAfterPt, w = mf(h);
	return O_({
		kind: "paragraph",
		id: t.id,
		source: t.source,
		...e.paragraphId === void 0 ? {} : { paragraphId: e.paragraphId },
		flowDomainId: t.flowDomainId,
		ordinaryFlow: t.ordinaryFlow,
		...e.styleId === void 0 ? {} : { styleId: e.styleId },
		...!t.continuesFromPrevious && e.bookmarks?.length ? { bookmarkStarts: e.bookmarks } : {},
		flowBounds: {
			xPt: t.placement.paragraphXPt,
			yPt: t.placement.startYPt,
			widthPt: t.placement.availableWidthPt,
			heightPt: n.contentEndYPt - t.placement.startYPt + C
		},
		inkBounds: { ...e.shading || e.borders ? b : {
			xPt: i,
			yPt: n.contentStartYPt,
			widthPt: Math.max(0, ...c.map((e) => e.bounds.widthPt)),
			heightPt: v
		} },
		spacing: {
			beforePt: t.placement.suppressSpaceBefore ? 0 : n.requestedSpaceBeforePt,
			afterPt: C
		},
		contextualSpacing: e.contextualSpacing ?? !1,
		lines: c,
		borders: S,
		shading: e.shading ? { color: `#${e.shading}` } : void 0,
		resources: l,
		drawings: u,
		textBoxes: d,
		events: g,
		exclusions: Fv(t.exclusions, p),
		...w ? { cellContainmentBounds: w } : {},
		anchorCollisions: Iv(t.anchorCollisions ?? [], m),
		...f.length ? { anchorFrames: f } : {},
		paragraphMark: n.markOnly ? {
			hidden: e.markVanish === !0,
			bounds: {
				xPt: i,
				yPt: n.contentStartYPt,
				widthPt: 0,
				heightPt: v
			}
		} : void 0
	});
}
var Kv = (e, t) => zm(e, {
	xPt: 0,
	yPt: t
}), qv = (e, t) => Z(e, {
	xPt: 0,
	yPt: t
}), Jv = (e, t) => Um(e, {
	xPt: 0,
	yPt: t
}), Yv = (e, t) => Gm(e, {
	xPt: 0,
	yPt: t
}), Xv = (e, t) => Km(e, {
	xPt: 0,
	yPt: t
}), Zv = (e, t) => Ym(e, {
	xPt: 0,
	yPt: t
}), Qv = (e, t) => Zm(e, {
	xPt: 0,
	yPt: t
});
function $v(e, t, n, r) {
	if (!e.shading && e.borders.length === 0) return null;
	let i = t[0], a = t.at(-1);
	if (!i || !a) return {
		box: qv(e.inkBounds, n),
		borders: []
	};
	let o = e.inkBounds.yPt, s = o + e.inkBounds.heightPt, c = r.continuesFromPrevious ? Math.max(o, i.bounds.yPt) : o, l = r.continuesOnNext ? Math.min(s, a.bounds.yPt + a.advancePt) : s, u = {
		xPt: e.inkBounds.xPt,
		yPt: c + n,
		widthPt: e.inkBounds.widthPt,
		heightPt: Math.max(0, l - c)
	}, d = u.xPt, f = d + u.widthPt, p = u.yPt, m = p + u.heightPt;
	return {
		box: u,
		borders: e.borders.flatMap((e) => (e.edge === "top" || e.edge === "between") && r.continuesFromPrevious || e.edge === "bottom" && r.continuesOnNext ? [] : e.edge === "top" || e.edge === "between" ? [{
			...e,
			from: {
				xPt: d,
				yPt: p
			},
			to: {
				xPt: f,
				yPt: p
			}
		}] : e.edge === "bottom" ? [{
			...e,
			from: {
				xPt: d,
				yPt: m
			},
			to: {
				xPt: f,
				yPt: m
			}
		}] : e.edge === "left" ? [{
			...e,
			from: {
				xPt: d,
				yPt: p
			},
			to: {
				xPt: d,
				yPt: m
			}
		}] : e.edge === "right" ? [{
			...e,
			from: {
				xPt: f,
				yPt: p
			},
			to: {
				xPt: f,
				yPt: m
			}
		}] : [{
			...e,
			from: Kv(e.from, n),
			to: Kv(e.to, n)
		}])
	};
}
function ey(e, t, n = `${e.id}:${t.lineStart}-${t.lineEnd}`) {
	let r = e.lines.slice(t.lineStart, t.lineEnd), i = r[0], a = r.at(-1), o = t.continuesFromPrevious && i ? e.flowBounds.yPt - i.bounds.yPt : 0, s = o === 0 ? r : r.map((e) => Xv(e, o)), c = s[0], l = s.at(-1), u = e.lines.map((e, n) => n >= t.lineStart && n < t.lineEnd ? s[n - t.lineStart] : e), d = c && l ? {
		xPt: Math.min(...s.map((e) => e.bounds.xPt)),
		yPt: c.bounds.yPt,
		widthPt: Math.max(...s.map((e) => e.bounds.xPt + e.bounds.widthPt)) - Math.min(...s.map((e) => e.bounds.xPt)),
		heightPt: l.bounds.yPt + l.bounds.heightPt - c.bounds.yPt
	} : e.inkBounds, f = $v(e, r, o, t), p = new Set(r.flatMap((e) => e.placements.flatMap((e) => e.kind === "drawing" ? [e.drawingId] : []))), m = e.drawings.filter((e) => p.has(e.id)).map((e) => e.anchorLayer?.verticalOwnership === "page" ? e : Jv(e, o)), h = mf(m.filter((e) => e.anchorLayer?.cellContainment === !0).map((e) => e.flowBounds)), g = new Set(e.drawings.flatMap((e) => {
		if (e.anchorLayer?.verticalOwnership !== "host") return [];
		let t = e.anchorLayer.acquisitionOccurrenceId ?? e.anchorLayer.occurrenceId;
		return t === void 0 ? [] : [t];
	})), _ = new Set(m.flatMap((e) => {
		if (e.anchorLayer?.verticalOwnership !== "host") return [];
		let t = e.anchorLayer.acquisitionOccurrenceId ?? e.anchorLayer.occurrenceId;
		return t === void 0 ? [] : [t];
	})), v = new Set(r.flatMap((e) => e.placements.flatMap((e) => e.kind === "resource" ? [e.resourceKey] : [])));
	for (let e of m) for (let t of e.commands) t.kind === "resource" && v.add(t.resourceKey);
	let y = new Set(m.flatMap((e) => [e.id.replace(":drawing:", ":textbox:"), ...e.textBoxIds ?? []])), b = new Set(m.filter((e) => e.anchorLayer?.verticalOwnership === "page" || e.orientation === "upright-physical").flatMap((e) => e.textBoxIds ?? [])), x = new Set(m.map((e) => On("source-occurrence", e.source))), S = i?.range.start, C = a?.range.end, { bookmarkStarts: w, ...T } = e;
	return O_({
		...T,
		kind: "paragraph",
		id: n,
		...!t.continuesFromPrevious && w?.length ? { bookmarkStarts: w } : {},
		lines: u,
		flowBounds: {
			...e.flowBounds,
			yPt: e.flowBounds.yPt
		},
		...e.clipBounds ? { clipBounds: qv(e.clipBounds, o) } : {},
		spacing: {
			beforePt: t.continuesFromPrevious ? 0 : e.spacing.beforePt,
			afterPt: t.continuesOnNext ? 0 : e.spacing.afterPt
		},
		inkBounds: f?.box ?? d,
		borders: f?.borders ?? e.borders.map((e) => ({
			...e,
			from: Kv(e.from, o),
			to: Kv(e.to, o)
		})),
		resources: e.resources.filter((e) => v.has(e.resourceKey)),
		drawings: m,
		cellContainmentBounds: h ?? void 0,
		textBoxes: e.textBoxes.filter((e) => y.has(e.id) || x.has(On("source-occurrence", e.source))).map((e) => b.has(e.id) ? e : Qv(e, o)),
		events: S === void 0 || C === void 0 ? [] : e.events.filter((e) => e.offset >= S && (e.offset < C || !t.continuesOnNext && e.offset === C)),
		exclusions: e.exclusions.filter((e) => e.verticalOwnership === "page" || e.anchorOccurrenceId === void 0 || !g.has(e.anchorOccurrenceId) || _.has(e.anchorOccurrenceId)).map((e) => ({
			...e,
			bounds: e.verticalOwnership === "page" ? e.bounds : qv(e.bounds, o),
			polygon: e.verticalOwnership === "page" ? e.polygon : e.polygon.map((e) => Kv(e, o))
		})),
		anchorCollisions: (e.anchorCollisions ?? []).filter((e) => e.verticalOwnership === "page" || !g.has(e.occurrenceId) || _.has(e.occurrenceId)).map((e) => ({
			...e,
			bounds: e.verticalOwnership === "page" ? e.bounds : qv(e.bounds, o)
		})),
		...t.continuesOnNext ? { paragraphMark: void 0 } : e.paragraphMark ? { paragraphMark: {
			...e.paragraphMark,
			bounds: qv(e.paragraphMark.bounds, o)
		} } : {},
		continuation: t
	});
}
//#endregion
//#region packages/docx/src/layout/paragraph-pagination.ts
function ty(e, t) {
	return e.segIndex - t.segIndex || e.charOffset - t.charOffset;
}
function ny(e, t, n, r, i, a, o, s, c, l) {
	if (![r, i].every((e) => Number.isFinite(e) && e >= 0)) throw RangeError("Paragraph fragment extents must be finite and non-negative");
	if (n.length !== e.lines.length) throw RangeError("Paragraph source boundaries must align with retained lines");
	let u = o.authoredSpaceAfterPt ?? 0;
	if (!Number.isFinite(u) || u < 0) throw RangeError("Authored paragraph spaceAfter must be finite and non-negative");
	let d = e.lines.length, f = (n) => ey(e, {
		lineStart: 0,
		lineEnd: n,
		continuesFromPrevious: t.boundary !== null,
		continuesOnNext: n < d
	}), p = (e) => {
		let t = s?.(e) ?? 0;
		if (!Number.isFinite(t) || t < 0) throw RangeError("Paragraph page-local reserve must be finite and non-negative");
		return t;
	}, m = (e) => l?.(e) ?? !0, h = (e, t) => {
		if (!t) return e.advancePt;
		let n = kc({
			advancePt: e.advancePt,
			retainedSpaceAfterPt: e.spacing.afterPt,
			authoredSpaceAfterPt: u
		});
		return Mc({
			paragraph: e,
			writingMode: o.writingMode ?? "horizontal-tb",
			logicalLineBoxExtentPt: n,
			availableBlockExtentPt: r
		});
	};
	if (d === 0) {
		let n = p(e), o = h(e, !0);
		return a && (o + n > r || !m(n)) && o + n <= i ? {
			fragment: null,
			nextCursor: t,
			requiresFreshFlowRegion: !0,
			additionalReservePt: 0,
			admittedBlockExtentPt: 0
		} : {
			fragment: e,
			nextCursor: null,
			requiresFreshFlowRegion: !1,
			additionalReservePt: n,
			admittedBlockExtentPt: Math.min(e.advancePt, r)
		};
	}
	let g = p(e), _ = h(e, !0);
	if (t.boundary === null && o.keepLines && a && (_ + g > r || !m(g)) && _ + g <= i) return {
		fragment: null,
		nextCursor: t,
		requiresFreshFlowRegion: !0,
		additionalReservePt: 0,
		admittedBlockExtentPt: 0
	};
	let v = Th(0, d, r, (e) => (() => {
		let t = f(e), n = p(t);
		return m(n) ? h(t, e === d) + n : r + 1;
	})()).end;
	if (v === 0) {
		if (a) return {
			fragment: null,
			nextCursor: t,
			requiresFreshFlowRegion: !0,
			additionalReservePt: 0,
			admittedBlockExtentPt: 0
		};
		v = 1;
	}
	for (;;) {
		let e = Eh({
			widowControl: o.widowControl,
			start: 0,
			end: v,
			totalLines: d,
			canRelocate: a
		});
		if (e.kind === "relocate") return {
			fragment: null,
			nextCursor: t,
			requiresFreshFlowRegion: !0,
			additionalReservePt: 0,
			admittedBlockExtentPt: 0
		};
		if (e.kind !== "dropLastLine") break;
		--v;
	}
	let y = f(v), b = v < d ? n[v - 1] : null;
	if (b !== null && t.boundary !== null && ty(b, t.boundary) <= 0) throw Error("Paragraph continuation source boundary did not advance");
	return {
		fragment: y,
		nextCursor: b === null ? null : Object.freeze({
			boundary: b,
			sourceRangeStart: y.lines.at(-1).range.end,
			...c === void 0 ? {} : { uniformRubyAdvancePt: c }
		}),
		requiresFreshFlowRegion: !1,
		additionalReservePt: p(y),
		admittedBlockExtentPt: Math.min(y.advancePt, r)
	};
}
//#endregion
//#region packages/docx/src/layout/note-reference-ownership.ts
function ry(e, t) {
	let n = /* @__PURE__ */ new Map();
	if (!e) return n;
	let r = new Set(e.map((e) => e.id));
	return t.forEach((e) => {
		r.has(e) && !n.has(e) && n.set(e, n.size + 1);
	}), n;
}
function iy(e) {
	let t = /* @__PURE__ */ new Map();
	if (!e) return t;
	for (let n of e) t.set(n.id, n);
	return t;
}
function ay(e, t) {
	let n = [], r = /* @__PURE__ */ new Set();
	for (let i of e) if (i.type === "paragraph") for (let e of i.runs) e.type !== "text" || e.noteRef?.kind !== t || e.noteRef.id.length === 0 || r.has(e.noteRef.id) || (r.add(e.noteRef.id), n.push(e.noteRef.id));
	else if (i.type === "table") for (let e of i.rows) for (let i of e.cells) for (let e of ay(i.content, t)) r.has(e) || (r.add(e), n.push(e));
	return Object.freeze(n);
}
function oy(e, t) {
	return Object.freeze([...new Set(e.flatMap((e) => e.placements.flatMap((e) => e.kind === "text" && e.noteReference?.kind === t ? [e.noteReference.id] : [])))]);
}
function sy(e, t) {
	return e.rows.flatMap((e) => e.cells.flatMap((e) => e.blocks.flatMap((e) => cy(e.layout, t))));
}
function cy(e, t) {
	let n = e.kind === "paragraph" ? oy(e.lines, t) : sy(e, t);
	return Object.freeze([...new Set(n)]);
}
function ly(e) {
	return oy(e, "footnote");
}
function uy(e) {
	return cy(e, "footnote");
}
function dy(e) {
	return cy(e, "endnote");
}
//#endregion
//#region packages/docx/src/layout/column-balancing.ts
function fy(e) {
	if (!Number.isInteger(e.columnCount) || e.columnCount <= 0) throw RangeError("Column count must be a positive integer");
	for (let t of e.fragments) if (!Number.isFinite(t.extentPt) || t.extentPt < 0) throw RangeError("Column balance fragment extents must be finite and non-negative");
	if (e.fragments.length === 0) return Object.freeze({
		targetPt: 0,
		cutIndexes: Object.freeze([]),
		transitionExpansions: 0
	});
	let t = [0], n = [0], r = [];
	e.fragments.forEach((i, a) => {
		t.push(t[a] + i.extentPt);
		let o = a + 1;
		(i.breakAfter !== "forbidden" || o === e.fragments.length) && n.push(o), i.breakAfter === "forced" && o < e.fragments.length && r.push(o);
	});
	let i = Math.min(e.columnCount, n.length - 1), a = Array.from({ length: i + 1 }, () => Array(n.length).fill(Infinity)), o = Array.from({ length: i + 1 }, () => Array(n.length).fill(-1));
	a[0][0] = 0;
	let s = 0;
	for (let e = 1; e <= i; e += 1) {
		let i = a[e - 1], c = a[e], l = i.flatMap((e, t) => Number.isFinite(e) ? [t] : []), u = 0, d = 0, f = 0, p = 0;
		for (let a = 1; a < n.length; a += 1) {
			let m = n[a];
			for (; d < r.length && r[d] < m;) f = r[d], d += 1;
			for (; n[p] < f;) p += 1;
			for (; u < l.length && l[u] < p;) u += 1;
			let h = l[u];
			if (h === void 0 || h >= a) continue;
			let g = (e) => {
				s += 1;
				let r = n[e];
				return Math.max(i[e], t[m] - t[r]);
			}, _ = h, v = g(_);
			for (; u + 1 < l.length;) {
				let e = l[u + 1];
				if (e >= a) break;
				let t = g(e);
				if (t > v) break;
				u += 1, _ = e, v = t;
			}
			c[a] = v, o[e][a] = _;
		}
	}
	let c = n.length - 1, l = -1, u = Infinity;
	for (let e = 1; e <= i; e += 1) {
		let t = a[e][c];
		t <= u && (u = t, l = e);
	}
	if (l < 0 || !Number.isFinite(u)) throw Error("Authored column breaks exceed the available column frontier");
	let d = [], f = c;
	for (let e = l; e > 0; --e) if (d.push(n[f]), f = o[e][f], f < 0) throw Error("Column balance frontier omitted a predecessor");
	return d.reverse(), Object.freeze({
		targetPt: u,
		cutIndexes: Object.freeze(d),
		transitionExpansions: s
	});
}
//#endregion
//#region packages/docx/src/layout/column-balance-frontier.ts
function py(e) {
	let t = /* @__PURE__ */ new Map();
	return e.sequence.forEach((e, n) => {
		if (e.kind === "body-block") {
			let r = e.block;
			t.set(kn(r.source), Object.freeze({
				sequenceIndex: n,
				keepLines: r.kind === "paragraph" && r.keepLines,
				keepNext: r.kind === "paragraph" && r.keepNext,
				widowControl: r.kind === "paragraph" && r.widowControl
			}));
			return;
		}
		e.kind === "adjacent-table-group" && e.tables.forEach((e) => t.set(kn(e.source), Object.freeze({
			sequenceIndex: n,
			keepLines: !1,
			keepNext: !1,
			widowControl: !1
		})));
	}), t;
}
function my(e, t, n) {
	let r = t - e;
	if (n.length <= 1) return Object.freeze([r]);
	let i = [], a = e;
	for (let e of n) {
		if (!Number.isFinite(e) || e < a || e > t) return Object.freeze([r]);
		i.push(e - a), a = e;
	}
	return i[i.length - 1] = i.at(-1) + t - a, Object.freeze(i);
}
function hy(e, t, n, r) {
	let i = new Set(r.flowDomainIds), a = new Map(n.layers.body.map((e) => [e.id, e])), o = py(e), s = [];
	for (let e of t) {
		if (!i.has(e.flowDomainId)) continue;
		let t = a.get(e.nodeId);
		if (!t || !t.ordinaryFlow) continue;
		let n = kn(t.source), r = o.get(n);
		if (!r) continue;
		let c = t.kind === "paragraph" && !r.keepLines && t.lines.length > 1 ? t.lines.map((e) => e.bounds.yPt + e.advancePt) : t.kind === "table" && t.rows.length > 1 ? t.rows.map((e) => e.flowBounds.yPt + e.advancePt) : [e.blockEndPt];
		my(e.blockStartPt, e.blockEndPt, c).forEach((e) => s.push({
			extentPt: e,
			breakAfter: "allowed",
			sequenceIndex: r.sequenceIndex,
			sourceIdentity: n,
			paragraphLine: t.kind === "paragraph" && !r.keepLines && t.lines.length > 0
		}));
	}
	let c = /* @__PURE__ */ new Map();
	s.forEach((e, t) => {
		let n = c.get(e.sourceIdentity) ?? [];
		n.push(t), c.set(e.sourceIdentity, n);
	});
	for (let [e, t] of c) {
		let n = o.get(e);
		if (!n) continue;
		let r = t.filter((e) => s[e].paragraphLine);
		n.keepLines && t.slice(0, -1).forEach((e) => {
			s[e].breakAfter = "forbidden";
		});
		for (let e = 0; e + 1 < r.length; e += 1) Eh({
			widowControl: n.widowControl,
			start: 0,
			end: e + 1,
			totalLines: r.length,
			canRelocate: !0
		}).kind !== "keep" && (s[r[e]].breakAfter = "forbidden");
		n.keepNext && (s[t.at(-1)].breakAfter = "forbidden");
	}
	let l = e.initialSection.sectionOccurrenceId;
	return e.sequence.forEach((e, t) => {
		if (e.kind === "begin-section") {
			l = e.section.sectionOccurrenceId;
			return;
		}
		if (!(l !== r.sectionOccurrenceId || e.kind !== "authored-break" || e.break !== "column")) {
			for (let e = s.length - 1; e >= 0; --e) if (!(s[e].sequenceIndex >= t)) {
				s[e].breakAfter = "forced";
				break;
			}
		}
	}), Object.freeze(s.map((e) => Object.freeze(e)));
}
function gy(e, t, n, r, i) {
	let a = hy(e, t, r, i), o = n.get(r.pageIndex) ?? 0;
	return fy({
		columnCount: i.flowDomainIds.length,
		fragments: a
	}).targetPt + o;
}
//#endregion
//#region packages/docx/src/layout/section-flow-composition.ts
function _y(e, t, n, r, i) {
	let a = t, o = e.lines.map((t, o) => {
		let s = a++, c = String(s), l = i.measureLineNumberGlyph(c), u = Object.freeze({
			xPt: e.flowBounds.xPt - r,
			yPt: t.baselinePt
		});
		return Object.freeze({
			lineIndex: o,
			counterValue: s,
			bounds: Object.freeze({
				xPt: u.xPt - l.widthPt,
				yPt: u.yPt - l.ascentPt,
				widthPt: l.widthPt,
				heightPt: l.ascentPt + l.descentPt
			}),
			paintOps: s % n === 0 ? Object.freeze([Object.freeze({
				kind: "text",
				text: c,
				origin: u,
				font: l.font ?? "",
				color: "#000000",
				textAlign: "right"
			})]) : Object.freeze([])
		});
	});
	return Object.freeze({
		paragraph: Object.freeze({
			...e,
			lineNumbers: Object.freeze(o)
		}),
		counterEnd: a
	});
}
function vy(e, t, n) {
	let r = /* @__PURE__ */ new Map(), i, a = e.pages.map((e) => {
		if (e.parityBlank) return e;
		let a = [...e.layers.body];
		for (let o = 0; o < e.sectionRegions.length; o += 1) {
			let s = e.sectionRegions[o], c = new Set(s.flowDomainIds), l = a.flatMap((e, t) => c.has(e.flowDomainId) ? [t] : []), u = new Map(l.map((e) => [a[e].id, a[e]])), d = n.filter((e) => {
				let t = u.get(e.nodeId);
				return c.has(e.flowDomainId) && e.blockEndPt > e.blockStartPt && t !== void 0 && (t.ordinaryFlow || t.sectionFlowOwnership === "host-flow");
			}), f = d.length === 0 ? s.blockStartPt : Math.min(...d.map((e) => e.blockStartPt)), p = d.length === 0 ? f : Math.max(...d.map((e) => e.blockEndPt)), m = s.blockEndPt, h = Math.max(0, m - s.blockStartPt), g = Math.max(0, p - f), _ = s.section.verticalAlignment, v = d.length > 0 && g < h ? _ === "center" ? s.blockStartPt + (h - g) / 2 - f : _ === "bottom" ? m - g - f : 0 : 0, y = s.section.lineNumbering, b = y?.restart === "newPage" ? y.start : y?.restart === "newSection" ? r.get(s.sectionOccurrenceId) ?? y.start : r.get(s.sectionOccurrenceId) ?? i ?? y?.start ?? 1;
			b ??= 1;
			for (let e of l) {
				let n = a[e];
				if (n.kind === "paragraph" && n.ordinaryFlow && y) {
					let e = _y(n, b, Math.max(1, y.countBy), dc(y.distance), t);
					n = e.paragraph, b = e.counterEnd;
				}
				v !== 0 && (n.ordinaryFlow || n.sectionFlowOwnership === "host-flow") && (n.kind === "paragraph" || n.kind === "table") && (n = sh(n, {
					xPt: 0,
					yPt: v
				})), a[e] = n;
			}
			y && (r.set(s.sectionOccurrenceId, b), i = b);
		}
		return Object.freeze({
			...e,
			layers: gd(e.layers, "body", a)
		});
	});
	return Object.freeze({
		...e,
		pages: Object.freeze(a)
	});
}
//#endregion
//#region packages/docx/src/layout/section-page-identity.ts
function yy(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) for (let e of n.sectionRegions) t.has(e.sectionOccurrenceId) || t.set(e.sectionOccurrenceId, n.pageIndex);
	return t;
}
function by(e, t) {
	let n = e[t];
	return n ? t === 0 || e[t - 1]?.sectionOccurrenceId !== n.sectionOccurrenceId : !1;
}
//#endregion
//#region packages/docx/src/layout/header-footer-reserve.ts
function xy(e, t) {
	return t.titlePage && t.firstPageOfSection ? e.first : t.evenAndOddHeaders && t.displayPageNumber % 2 == 0 ? e.even : e.default;
}
function Sy(e, t) {
	if (![
		e.pageHeight,
		e.marginTop,
		e.marginBottom,
		t.top,
		t.bottom
	].every(Number.isFinite)) throw RangeError("Reserved body interval inputs must be finite");
	if (e.pageHeight <= 0 || t.top < 0 || t.bottom < 0) throw RangeError("Reserved body interval requires a positive page and non-negative reserves");
	let n = Math.min(e.pageHeight, Math.abs(e.marginTop) + t.top), r = e.pageHeight - Math.abs(e.marginBottom) - t.bottom;
	return Object.freeze({
		blockStartPt: n,
		blockEndPt: Math.max(n, Math.min(e.pageHeight, r))
	});
}
function Cy(e, t, n) {
	if (![
		e,
		t,
		n
	].every(Number.isFinite)) throw RangeError("Header/footer reserve inputs must be finite");
	if (e < 0) throw RangeError("Story extent must be non-negative");
	return e === 0 || t < 0 ? 0 : Math.max(0, e - (t - n));
}
function wy(e) {
	let t = (t) => {
		let n = Object.freeze(e.measure(t).map((e) => Object.freeze({ ...e })));
		return Object.freeze({
			result: t,
			reserves: n,
			pageCount: n.length,
			fingerprint: On("header-footer-reserve-v1", {
				identity: e.identity(t),
				reserves: n
			})
		});
	}, n = t(e.seed);
	return !e.requiresConvergence && n.reserves.every((e) => e.top === 0 && e.bottom === 0) ? n : Na(n, (n) => t(e.repaginate(n.reserves, n.result)), e.limit ?? 16);
}
//#endregion
//#region packages/docx/src/layout/flow.ts
var Ty = class extends J {
	constructor(e, t) {
		super("INVALID_GEOMETRY", `${t} exceeds the available flow capacity`), this.containerId = e, this.layoutId = t, this.name = "FlowCapacityExceededError";
	}
};
function Ey(e, t) {
	if (e.length === 0) return {
		xPt: t.xPt,
		yPt: t.yPt,
		widthPt: 0,
		heightPt: 0
	};
	let n = Math.min(...e.map((e) => e.xPt)), r = Math.min(...e.map((e) => e.yPt)), i = Math.max(...e.map((e) => e.xPt + e.widthPt)), a = Math.max(...e.map((e) => e.yPt + e.heightPt));
	return {
		xPt: n,
		yPt: r,
		widthPt: i - n,
		heightPt: a - r
	};
}
function Dy(e, t, n) {
	let r = [], i = e.cursor, a = e.container.bounds;
	if (![
		a.xPt,
		a.yPt,
		a.widthPt,
		a.heightPt
	].every(Number.isFinite) || a.widthPt < 0 || a.heightPt < 0) throw new J("INVALID_GEOMETRY", `${e.container.id} has invalid bounds`);
	let o = e.container.bounds.yPt + e.container.bounds.heightPt, s = e.container.capacity === "unbounded" ? 2 ** 53 - 1 : o, c = e.container.bounds.xPt + e.container.bounds.widthPt;
	if (!Number.isFinite(i.xPt) || !Number.isFinite(i.yPt) || i.xPt < a.xPt || i.xPt > c || i.yPt < a.yPt || i.yPt > o) throw new J("INVALID_GEOMETRY", `${e.container.id} has an invalid initial flow cursor`);
	for (let a of e.blocks) {
		let l = {
			container: e.container,
			cursor: i,
			availableBounds: {
				xPt: e.container.bounds.xPt,
				yPt: i.yPt,
				widthPt: e.container.bounds.widthPt,
				heightPt: Math.max(0, s - i.yPt)
			}
		}, u = a.kind === "paragraph" ? n.layoutParagraph(a, l, t) : n.layoutTable(a, l, t);
		if (u.layout.flowDomainId !== e.container.id) throw new J("INVALID_REFERENCE", `${u.layout.id} belongs to ${u.layout.flowDomainId}, not ${e.container.id}`);
		if (e.container.capacity !== "unbounded" && Number.isFinite(u.nextCursor.yPt) && u.nextCursor.yPt > o) throw new Ty(e.container.id, u.layout.id);
		if (!Number.isFinite(u.nextCursor.xPt) || !Number.isFinite(u.nextCursor.yPt) || u.nextCursor.xPt < e.container.bounds.xPt || u.nextCursor.xPt > c || u.nextCursor.yPt < i.yPt) throw new J("INVALID_GEOMETRY", `${u.layout.id} returned an invalid flow cursor`);
		r.push(u.layout), i = u.nextCursor;
	}
	return {
		source: e.source,
		container: e.container,
		blocks: r,
		nextCursor: i,
		flowDomainId: e.container.id,
		flowBounds: Ey(r.map((e) => e.flowBounds), e.container.bounds),
		inkBounds: Ey(r.map((e) => e.inkBounds), e.container.bounds),
		...e.container.capacity === "unbounded" ? {} : { clipBounds: e.container.bounds },
		advancePt: i.yPt - e.cursor.yPt,
		ordinaryFlow: !0
	};
}
//#endregion
//#region packages/docx/src/layout/stories.ts
var Oy = /* @__PURE__ */ new WeakMap(), ky = (e) => "type" in e && e.type === "unsupportedTextBoxBlock";
function Ay(e, t) {
	if (Oy.has(e)) throw Error("Story block layout algorithms are already attached");
	Oy.set(e, Object.freeze({ ...t }));
}
function jy(e, t) {
	return Object.freeze({
		...e,
		flowBounds: Z(e.flowBounds, t),
		inkBounds: Z(e.inkBounds, t),
		...e.clipBounds ? { clipBounds: Z(e.clipBounds, t) } : {},
		blocks: Object.freeze(e.blocks.map((e) => {
			if (e.kind === "paragraph") return $m(e, t);
			if (e.kind === "table") return eh(e, t);
			throw Error(`Story contains unsupported retained node: ${e.kind}`);
		}))
	});
}
function My(e, t) {
	return Object.freeze({
		...e,
		flowBounds: Z(e.flowBounds, t),
		inkBounds: Z(e.inkBounds, t),
		...e.clipBounds ? { clipBounds: Z(e.clipBounds, t) } : {},
		separator: Object.freeze(e.separator.map((e) => Bm(e, t))),
		story: jy(e.story, t)
	});
}
function Ny(e, t) {
	for (let t of e.blocks) if (!ky(t) && (t.source.story !== e.source.story || t.source.storyInstance !== e.source.storyInstance)) throw new J("INVALID_REFERENCE", `Story block ${t.source.story}:${t.source.storyInstance} is not owned by ${e.source.story}:${e.source.storyInstance}`);
	let n = Oy.get(t);
	if (!n) throw Error("Story block layout algorithms are not attached to the supplied services");
	let r = e.blocks.filter(ky), i = Dy({
		blocks: e.blocks.filter((e) => !ky(e)),
		container: e.container,
		cursor: {
			xPt: e.container.bounds.xPt,
			yPt: e.container.bounds.yPt
		},
		source: e.source
	}, t, n);
	return Object.freeze({
		story: e.source.story,
		flowBounds: i.flowBounds,
		inkBounds: i.inkBounds,
		...i.clipBounds ? { clipBounds: i.clipBounds } : {},
		blocks: Object.freeze([...i.blocks]),
		advancePt: i.advancePt,
		diagnostics: Object.freeze(r.map((t) => Object.freeze({
			code: "UNSUPPORTED_FEATURE",
			severity: "warning",
			source: Object.freeze({
				story: e.source.story,
				storyInstance: e.source.storyInstance,
				path: Object.freeze([...t.sourcePath])
			}),
			message: `Unsupported text-box block ${t.qName}`
		})))
	});
}
//#endregion
//#region packages/docx/src/layout/body-paginator.ts
var Py = class extends Error {
	code = "FOOTNOTE_RESERVE_EXCEEDS_FRESH_PAGE";
	constructor(e, t, n) {
		super(`Body footnote admission cannot fit a fresh physical page (reserve: ${e}, charge: ${t}, fresh page: ${n})`), this.reservePt = e, this.admissionChargePt = t, this.freshPageExtentPt = n, this.name = "FootnoteAdmissionOverflowError";
	}
};
function Fy(e, t) {
	if (t.has(e)) return [];
	t.add(e);
	let n = e.diagnostics ?? [];
	return e.kind === "paragraph" ? [
		...n,
		...e.drawings.flatMap((e) => Fy(e, t)),
		...e.textBoxes.flatMap((e) => Fy(e, t))
	] : e.kind === "table" ? [
		...n,
		...e.rows.flatMap((e) => e.cells.flatMap((e) => e.blocks.flatMap((e) => Fy(e.layout, t)))),
		...(e.floatingTables ?? []).flatMap((e) => Fy(e.child, t)),
		...(e.resolvedFloatingTables ?? []).flatMap((e) => Fy(e.child, t))
	] : e.kind === "textbox" || e.kind === "note" ? [
		...n,
		...e.story.diagnostics,
		...e.story.blocks.flatMap((e) => Fy(e, t))
	] : n;
}
function Iy(e, t, n) {
	if (e > 0 && t > n) throw new Py(e, t, n);
}
function Ly(e) {
	let t = /* @__PURE__ */ new Set(), n = (e) => {
		for (let r of e.resolvedFloatingTables ?? []) t.add(r.occurrenceId), n(r.child);
	};
	return n(e), t;
}
function Ry(e, t, n) {
	if (!e.floats) throw Error("Accepted floating table omitted its float registry delta");
	let r = Ly(t);
	return Object.freeze({
		...e,
		floats: Object.freeze({
			...e.floats,
			entries: Object.freeze(e.floats.entries.map((e) => {
				let i = r.has(e.occurrenceId) ? th(n, e.occurrenceId) : t.ordinaryFlow ? null : n;
				return i === null ? e : Object.freeze({
					...e,
					occurrenceId: i,
					exclusionId: i
				});
			}))
		})
	});
}
function zy(e, t) {
	let n = new Set(t.drawings.flatMap((e) => {
		let t = e.anchorLayer?.acquisitionOccurrenceId ?? e.anchorLayer?.occurrenceId;
		return t === void 0 ? [] : [t];
	})), r = e.floats?.entries.filter((e) => n.has(e.occurrenceId)) ?? [], i = e.drawingCollisions?.entries.filter((e) => n.has(e.occurrenceId)) ?? [];
	return r.length === 0 && i.length === 0 ? null : Object.freeze({
		...e.floats && r.length > 0 ? { floats: Object.freeze({
			...e.floats,
			entries: Object.freeze(r),
			nextParagraphId: e.floats.baseNextParagraphId + r.length
		}) } : {},
		...e.drawingCollisions && i.length > 0 ? { drawingCollisions: Object.freeze({
			...e.drawingCollisions,
			entries: Object.freeze(i)
		}) } : {}
	});
}
function By(e) {
	let t = new Map([[e.initialSection.sectionOccurrenceId, e.initialSection]]);
	for (let n = 0; n < e.sequence.length; n += 1) {
		let r = e.sequence[n];
		r.kind === "begin-section" && t.set(r.section.sectionOccurrenceId, r.section);
	}
	return t;
}
function Vy(e, t) {
	return Cc(e.context, e.pageLayout, t);
}
function Hy(e, t) {
	let n = Vy(e, t);
	return hc({
		sectionOccurrenceId: e.sectionOccurrenceId,
		geometry: n.geometry,
		columns: n.columns,
		textDirection: n.textDirection,
		sectionBidi: n.sectionBidi === !0,
		grid: n.grid
	});
}
function Uy(e, t, n, r = n.blockStartPt, i = Vy(e, t).columns.map((e, t) => t)) {
	let a = Vy(e, t);
	return Object.freeze({
		id: `page:${t}:section:${encodeURIComponent(e.sectionOccurrenceId)}`,
		sectionOccurrenceId: e.sectionOccurrenceId,
		section: a,
		pageBorders: e.pageBordersAuthored ? e.pageBorders : null,
		writingMode: Td(a.textDirection),
		blockStartPt: r,
		blockEndPt: n.blockEndPt,
		columnFlowDirection: a.sectionBidi === !0 ? "rtl" : "ltr",
		columnIndexes: Object.freeze([...i]),
		columns: Object.freeze(i.map((e) => {
			let t = a.columns[e];
			if (!t) throw Error("Missing authored section column");
			return Object.freeze({
				inlineStartPt: t.xPt,
				inlineExtentPt: t.wPt
			});
		}))
	});
}
function Wy(e, t) {
	let n = Td(e.textDirection), r = jd({
		widthPt: e.geometry.pageWidth,
		heightPt: e.geometry.pageHeight
	}, n);
	return Object.freeze(n === "horizontal-tb" ? {
		...r,
		contentTopPt: t.blockStartPt,
		contentBottomPt: t.blockEndPt
	} : {
		...r,
		contentTopPt: 0,
		contentBottomPt: r.heightPt
	});
}
function Gy(e, t, n) {
	return Sy(Vy(e, t).geometry, n);
}
function Ky(e, t, n) {
	let r = Vy(e, t);
	return Mm({
		kind: "content",
		pageIndex: t,
		physicalPage: Wy(r, n),
		sectionOccurrenceId: e.sectionOccurrenceId,
		section: r,
		region: Uy(e, t, n)
	});
}
function qy(e) {
	let t = e.pages.at(-1), n = t?.accumulator.sectionRegions.at(-1);
	if (!t || t.kind !== "content" || !n) throw Error("Missing active body region");
	return n;
}
function Jy(e) {
	let t = qy(e), n = t.columnIndexes ?? t.section.columns.map((e, t) => t), r = (t.columnFlowDirection === "rtl" ? [...n].reverse() : [...n]).at(-1) === e.flow.columnIndex;
	return e.balanceTargetPt === null || r ? t.blockEndPt : Math.min(t.blockEndPt, t.blockStartPt + e.balanceTargetPt);
}
function Yy(e) {
	let t = qy(e), n = t.columnIndexes ?? t.section.columns.map((e, t) => t), r = t.columns[n.indexOf(e.flow.columnIndex)];
	if (!r) throw Error("Missing active body column");
	return Object.freeze({
		pageIndex: e.flow.pageIndex,
		columnIndex: e.flow.columnIndex,
		flowDomainId: Kd(e.flow.pageIndex, t.id, e.flow.columnIndex),
		section: t.section,
		cursorPt: Object.freeze({
			xPt: r.inlineStartPt,
			yPt: e.flow.cursorBlockPt
		}),
		availableBounds: Object.freeze({
			xPt: r.inlineStartPt,
			yPt: e.flow.cursorBlockPt,
			widthPt: r.inlineExtentPt,
			heightPt: Math.max(0, Jy(e) - e.footnoteReservePt - e.flow.cursorBlockPt)
		})
	});
}
function Xy(e, t) {
	let n = (t) => {
		let n = e.get(t);
		if (!n) throw Error(`Unknown body section ${t}`);
		return n;
	};
	return {
		openContentPage(e) {
			let r = n(e.sectionOccurrenceId), i = t[e.pageIndex] ?? {
				top: 0,
				bottom: 0
			}, a = Gy(r, e.pageIndex, i), o = fh(Hy(r, e.pageIndex), {
				pageIndex: e.pageIndex,
				pageContentStartBlockPt: a.blockStartPt,
				pageContentEndBlockPt: a.blockEndPt
			});
			return {
				page: Ky(r, e.pageIndex, a),
				flow: o
			};
		},
		openParityBlankPage(e) {
			let r = n(e.sectionOccurrenceId), i = Vy(r, e.pageIndex), a = Gy(r, e.pageIndex, t[e.pageIndex] ?? {
				top: 0,
				bottom: 0
			});
			return Mm({
				kind: "parity-blank",
				pageIndex: e.pageIndex,
				physicalPage: Wy(i, a),
				sectionOccurrenceId: r.sectionOccurrenceId,
				section: i,
				pageBorders: r.pageBordersAuthored ? r.pageBorders : null
			});
		},
		openSamePageSectionRegion(e, t, r) {
			let i = n(t.section.sectionOccurrenceId), a = e.accumulator.sectionRegions, o = a.at(-1);
			if (!o || !("placement" in t)) throw Error("A same-page section requires explicit retained placement");
			let s = Object.freeze({
				blockStartPt: e.accumulator.sectionRegions[0].blockStartPt,
				blockEndPt: o.blockEndPt
			}), c = t.placement === "same-page-block" ? Object.freeze({
				...o,
				blockEndPt: r.regionStartBlockPt
			}) : (() => {
				let e = t.outgoingColumnSubset;
				if (!e || e.length === 0) throw Error("A same-page-column transition requires outgoing column ownership");
				return Object.freeze({
					...o,
					columnIndexes: Object.freeze([...e]),
					columns: Object.freeze(e.map((e) => {
						let t = o.section.columns[e];
						if (!t) throw Error("Missing outgoing authored column");
						return Object.freeze({
							inlineStartPt: t.xPt,
							inlineExtentPt: t.wPt
						});
					}))
				});
			})(), l = Object.freeze([...a.slice(0, -1), c]);
			return Object.freeze({
				...e,
				accumulator: uf(Object.freeze({
					...e.accumulator,
					sectionRegions: l
				}), Uy(i, r.pageIndex, s, r.regionStartBlockPt, t.columnSubset))
			});
		}
	};
}
function Zy(e, t, n, r, i, a, o, s) {
	let c = e.pages.at(-1);
	if (!c || c.kind !== "content") throw Error("Body content requires an active page");
	let l = qy(e), u = l.columnIndexes ?? l.section.columns.map((e, t) => t), d = l.columns[u.indexOf(e.flow.columnIndex)], f = Kd(e.flow.pageIndex, l.id, e.flow.columnIndex), p = An(n, f, i);
	if (a.has(p)) throw Error(`Duplicate body occurrence acceptance: ${p}`);
	a.add(p);
	let m = ch(t, {
		occurrenceId: p,
		destination: {
			coordinateSpace: "logical-page-points",
			flowDomainId: f,
			translation: {
				xPt: s ? s.xPt - t.flowBounds.xPt : t.kind === "table" ? d.inlineStartPt : d.inlineStartPt - t.flowBounds.xPt,
				yPt: (s?.yPt ?? e.flow.cursorBlockPt) - t.flowBounds.yPt
			}
		}
	}), h = s?.sectionFlowOwnership === void 0 ? m : Object.freeze({
		...m,
		sectionFlowOwnership: s.sectionFlowOwnership
	}), g = s?.yPt ?? e.flow.cursorBlockPt, _ = h.kind === "paragraph" && h.ordinaryFlow ? (() => {
		let e = g + h.spacing.beforePt, t = g + r - h.spacing.afterPt;
		return Object.freeze({
			...h,
			flowBounds: Object.freeze({
				...h.flowBounds,
				yPt: e,
				heightPt: Math.max(0, t - e)
			})
		});
	})() : h, v = s?.coordinateSpace === "upright-physical" ? {
		..._,
		ordinaryFlow: !1,
		flowBounds: Object.freeze({
			..._.flowBounds,
			heightPt: r
		})
	} : _, y = mh(e.flow, v, r), b = y.events[0];
	if (!b || b.type !== "place") throw Error("Flow placement did not emit an allocation");
	o.push(Object.freeze({
		nodeId: v.id,
		flowDomainId: v.flowDomainId,
		blockStartPt: b.blockStartPt,
		blockEndPt: b.blockEndPt
	}));
	let x = df(c.accumulator, {
		layer: "body",
		node: v,
		...s?.coordinateSpace === "upright-physical" ? { coordinateSpace: "upright-physical" } : {}
	}, !0), S = [...e.pages];
	return S[S.length - 1] = Object.freeze({
		...c,
		accumulator: x
	}), Object.freeze({
		...e,
		flow: y.state,
		pages: Object.freeze(S)
	});
}
function Qy(e) {
	return e.boundary === null ? "root" : `paragraph:${e.boundary.segIndex}:${e.boundary.charOffset}`;
}
function $y(e, t) {
	for (let n = t; n < e.sequence.length; n += 1) {
		let t = e.sequence[n];
		if (t.kind === "consume-source") continue;
		if (t.kind === "authored-break") {
			if (t.break !== "lastRenderedPageBreak") return !1;
			continue;
		}
		if (t.kind === "begin-section") {
			if (t.section.startType !== "continuous") return !1;
			continue;
		}
		let r = t.kind === "adjacent-table-group" ? t : t.block;
		if (r.kind !== "paragraph") return !0;
		if (r.pageBreakBefore) return !1;
		if (r.inkless !== !0) return !0;
	}
	return !1;
}
function eb(e) {
	return e.paragraphMark !== void 0 && e.lines.length === 0 && e.shading === void 0 && e.borders.length === 0 && e.resources.length === 0 && e.drawings.length === 0 && e.textBoxes.length === 0;
}
function tb(e) {
	return [
		e.rowIndex,
		e.rowFragmentIndex,
		e.cells.map((e) => [
			e.blockIndex,
			e.paragraphLineStart,
			e.nestedFragmentIndex,
			e.nestedCursor === null ? null : tb(e.nestedCursor)
		])
	];
}
function nb(e) {
	if (e === void 0) return "root";
	if (e.kind === "table") return `table:${JSON.stringify(tb(e.cursor))}`;
	let t = e.cursor.tableCursor;
	return `adjacent-table:${e.cursor.tableIndex}:${e.cursor.sourceRowIndex}:${JSON.stringify(t === void 0 ? null : tb(t))}`;
}
function rb(e, t) {
	let n = e.cursorPt.yPt + t, r = e.availableBounds.yPt + e.availableBounds.heightPt;
	return Object.freeze({
		...e,
		cursorPt: Object.freeze({
			...e.cursorPt,
			yPt: n
		}),
		availableBounds: Object.freeze({
			...e.availableBounds,
			yPt: n,
			heightPt: Math.max(0, r - n)
		})
	});
}
function ib(e, t) {
	let n = yy(e.pages.map((e) => e.accumulator)), r = 0, i = null, a = e.pages.map((e) => {
		let a = t.get(e.accumulator.sectionOccurrenceId), o = a.sectionOccurrenceId !== i;
		a.sectionOccurrenceId !== i && a.pageNumbering.start !== null ? r = fc(a.pageNumbering.start, e.accumulator.pageIndex, n.get(a.sectionOccurrenceId) ?? e.accumulator.pageIndex) : r += 1, i = a.sectionOccurrenceId;
		let s = {
			displayNumber: r,
			format: a.pageNumbering.format ?? "decimal",
			sectionOccurrenceId: a.sectionOccurrenceId
		};
		return e.kind === "parity-blank" ? pf({
			pageIndex: e.accumulator.pageIndex,
			physicalPage: e.accumulator.physicalPage,
			sectionOccurrenceId: e.accumulator.sectionOccurrenceId,
			section: e.accumulator.section,
			pageBorders: e.accumulator.pageBorders,
			firstSectionOwnedPage: o,
			pageNumber: s
		}) : ff(e.accumulator, s, o);
	}), o = /* @__PURE__ */ new WeakSet();
	return {
		pages: a,
		diagnostics: a.flatMap((e) => _d(e).flatMap(({ node: e }) => Fy(e, o)))
	};
}
function ab(e, t, n, r, i, a) {
	let o = Lu(t);
	if (!o) throw Error("Body layout kernel is not attached to the supplied services");
	let s = By(e), c = /* @__PURE__ */ new Set(), l = [], u = r[0] ?? {
		top: 0,
		bottom: 0
	}, d = Gy(e.initialSection, 0, u), f = Nm(fh(Hy(e.initialSection, 0), {
		pageContentStartBlockPt: d.blockStartPt,
		pageContentEndBlockPt: d.blockEndPt
	}), Ky(e.initialSection, 0, d)), p = (e) => {
		let t = a.get(e.flow.section.sectionOccurrenceId);
		return t?.pageIndex === e.flow.pageIndex ? t.targetPt : null;
	};
	f = Pm(f, p(f));
	let m = Xy(s, r), h = null, g = o.openBodyLayoutSession({
		source: e.source,
		section: e.initialSection.context,
		initialLocation: Yy(f)
	}, t, n), _ = (e) => {
		let t = s.get(e.flow.section.sectionOccurrenceId);
		if (!t) throw Error(`Unknown body section ${e.flow.section.sectionOccurrenceId}`);
		let n = e.flow.pageIndex + 1, i = Gy(t, n, r[n] ?? {
			top: 0,
			bottom: 0
		});
		return i.blockEndPt - i.blockStartPt;
	}, v = (t, n) => {
		if (i !== null) {
			let e = Yy(t);
			return Object.freeze([...i.values()].filter((t) => t.pageIndex === e.pageIndex && t.flowDomainId === e.flowDomainId).map(({ occurrenceId: e, paragraphSource: t }) => Object.freeze({
				occurrenceId: e,
				paragraphSource: t
			})));
		}
		let r = [];
		for (let t = n; t < e.sequence.length; t += 1) {
			let i = e.sequence[t];
			if (i.kind === "authored-break" && i.break !== "column" || i.kind === "begin-section" && i.section.startType !== "continuous") break;
			if (!(i.kind !== "body-block" || i.block.kind !== "paragraph")) {
				if (t > n && i.block.pageBreakBefore) break;
				i.block.pageOwnedAnchorOccurrenceIds?.forEach((e) => r.push(Object.freeze({
					occurrenceId: e,
					paragraphSource: i.block.source
				})));
			}
		}
		return Object.freeze(r);
	}, y = (e, t) => {
		let n = v(e, t);
		if (n.length === 0) return;
		if (!g.prescanPageAnchors) throw Error("Page-owned anchors require canonical prescan acquisition");
		let r = Yy(e), i = g.prescanPageAnchors({
			anchors: n,
			location: r,
			availableInlineExtentPt: r.availableBounds.widthPt
		});
		i && g.commitFlowRegistryDelta(i);
	};
	y(f, 0);
	let b = (e, t, n = !1) => {
		let r = f.flow.pageIndex, i = e.events.some((e) => e.type === "next-page" && e.reason === "overflow"), a = e.events.some((e) => e.type === "begin-section" && "placement" in e && e.placement === "same-page-column");
		f = Im(f, e, m), f = Pm(f, p(f));
		let o = Yy(f);
		f.flow.pageIndex === r ? (g.moveAcquisitionCursor(o), a && y(f, t)) : (h = i && n ? t : null, g.resetPageAcquisition(o), y(f, t));
	}, x = /* @__PURE__ */ new Map(), S = /* @__PURE__ */ new Map(), C = /* @__PURE__ */ new Map(), w = (e) => (x.get(e)?.size ?? 0) > 0, T = (e, t, n) => E(n ?? uy(e), t), E = (e, t) => {
		let n = x.get(f.flow.pageIndex) ?? /* @__PURE__ */ new Set(), r = [...new Set(e)].filter((e) => !n.has(e)), i = Yy(f);
		if (r.length > 0 && !g.layoutNotes) throw Error("Footnote layout requires a note-capable layout session");
		let a = r.length === 0 ? Object.freeze([]) : g.layoutNotes({
			kind: "footnote",
			referenceIds: Object.freeze(r),
			pageIndex: f.flow.pageIndex,
			section: i.section,
			container: {
				id: `notes:page:${f.flow.pageIndex}`,
				kind: "footnote",
				bounds: {
					xPt: i.availableBounds.xPt,
					yPt: 0,
					widthPt: t,
					heightPt: i.section.geometry.pageHeight
				}
			},
			firstOnPage: n.size === 0
		});
		return Object.freeze({
			ids: Object.freeze(r),
			layouts: a,
			reservePt: a.reduce((e, t) => e + t.advancePt, 0)
		});
	}, D = (e, t, n) => {
		let r = x.get(f.flow.pageIndex);
		r || (r = /* @__PURE__ */ new Set(), x.set(f.flow.pageIndex, r)), e.forEach((e) => r.add(e));
		let i = C.get(f.flow.pageIndex) ?? [];
		i.push(...t), C.set(f.flow.pageIndex, i), S.set(f.flow.pageIndex, (S.get(f.flow.pageIndex) ?? 0) + n), f = Fm(f, n);
	}, O = () => Math.max(0, Jy(f) - f.footnoteReservePt - f.flow.deepestColumnBlockPt), k = (e) => e > O(), A = null, j = zc(e.sequence);
	for (let t = 0; t < e.sequence.length; t += 1) {
		let n = e.sequence[t];
		if (n.kind === "consume-source") continue;
		if (n.kind === "authored-break") {
			if (A = null, n.break === "column" && !j.has(t)) continue;
			b(Ch(f.flow, n.break, n.parity), t + 1);
			continue;
		}
		if (n.kind === "begin-section") {
			A = null;
			let e = Td(qy(f).section.textDirection), i = Td(Vy(n.section, f.flow.pageIndex).textDirection), a = jd({
				widthPt: qy(f).section.geometry.pageWidth,
				heightPt: qy(f).section.geometry.pageHeight
			}, e), o = Vy(n.section, f.flow.pageIndex), s = jd({
				widthPt: o.geometry.pageWidth,
				heightPt: o.geometry.pageHeight
			}, i), c = n.section.startType === "continuous" && (e !== i || a.widthPt !== s.widthPt || a.heightPt !== s.heightPt) ? "nextPage" : n.section.startType, l = Gy(n.section, f.flow.pageIndex, r[f.flow.pageIndex] ?? {
				top: 0,
				bottom: 0
			});
			b(wh(f.flow, Hy(n.section, f.flow.pageIndex), c, {
				hasFootnoteReferenceOnCurrentPage: w(f.flow.pageIndex),
				incomingPageContentStartBlockPt: l.blockStartPt,
				incomingPageContentEndBlockPt: l.blockEndPt
			}), t + 1);
			continue;
		}
		let i = n.kind === "adjacent-table-group" ? n : n.block;
		if (i.kind === "paragraph") {
			if (i.continuousSectionRole === "collapse-mark") continue;
			i.pageBreakBefore && b(Ch(f.flow, "pageBreakBefore"), t);
			let n = A?.spaceAfterPt ?? 0, a = Zg(A, i, n, i.continuousSectionRole === "suppress-before" ? 0 : i.spaceBeforePt), o = i.continuousSectionRole === "drop-previous-after" ? n : a.overlap;
			o > 0 && (f = Object.freeze({
				...f,
				flow: Object.freeze({
					...f.flow,
					cursorBlockPt: Math.max(f.flow.regionStartBlockPt, f.flow.cursorBlockPt - o)
				})
			}));
			let s = Object.freeze({ boundary: null });
			for (; s;) {
				let n = Qy(s), o = Yy(f), u = g.measureParagraph({
					input: i,
					location: o,
					availableInlineExtentPt: o.availableBounds.widthPt,
					suppressSpaceBefore: s.boundary !== null || i.continuousSectionRole === "suppress-before" || a.suppressBefore || s.boundary === null && !f.flow.pageHasContent && h === t,
					continuation: s
				});
				if (u.placement) {
					let e = T(u.layout, o.availableBounds.widthPt, u.retainedFootnoteReferenceIds), r = u.relocationBlockExtentPt, a = u.placement.sectionFlowOwnership === "page" ? e.reservePt : (r ?? u.blockExtentPt) + e.reservePt, d = _(f), p = k(e.reservePt);
					if (Iy(e.reservePt, a, d), (a > o.availableBounds.heightPt || p) && a <= d && f.flow.pageHasContent) {
						b(p ? bh(f.flow, f.flow.section, "overflow") : hh(f.flow, "overflow"), t);
						continue;
					}
					f = Zy(f, u.layout, i.source, u.blockExtentPt, n, c, l, u.placement), D(e.ids, e.layouts, e.reservePt), u.flowRegistryDelta && g.commitFlowRegistryDelta(u.flowRegistryDelta), s = null, g.moveAcquisitionCursor(Yy(f));
					continue;
				}
				if (s.boundary === null && i.keepNext && f.flow.pageHasContent) {
					let n = u.blockExtentPt, r = new Set(uy(u.layout)), a = !1, s = Nc({
						keepNext: i.keepNext,
						inkless: i.inkless === !0,
						undecoratedMark: eb(u.layout)
					});
					for (let i = t + 1; i < e.sequence.length; i += 1) {
						let t = e.sequence[i];
						if (t.kind === "consume-source") continue;
						if (t.kind === "authored-break" || t.kind === "begin-section") break;
						let c = t.kind === "adjacent-table-group" ? t : t.block;
						if (c.kind === "paragraph" && c.pageBreakBefore) break;
						let l = g.measureFollowingBlock({
							input: c,
							location: o,
							availableInlineExtentPt: o.availableBounds.widthPt
						}), u = c.kind === "paragraph" && (c.keepNext || s);
						if (s = !1, n += u ? l.fullExtentPt : l.leadContentExtentPt, (u ? l.fullFootnoteReferenceIds : l.leadFootnoteReferenceIds)?.forEach((e) => r.add(e)), !u) {
							a = !0;
							break;
						}
					}
					let c = E([...r], o.availableBounds.widthPt).reservePt, l = n + c;
					if (a && l > o.availableBounds.heightPt && l <= _(f)) {
						b(hh(f.flow, "overflow"), t, !0);
						continue;
					}
				}
				let d = e.sequence[t + 1], p = e.sequence[t + 2], m = d?.kind === "body-block" && d.block.kind === "paragraph" && p?.kind === "authored-break" && p.break === "page" && p.sameSourceParagraphAsPrevious !== !0, v = Ic(u.layout);
				if (s.boundary === null && v && m && f.flow.pageHasContent) {
					let e = rb(o, u.blockExtentPt), n = g.measureParagraph({
						input: d.block,
						location: e,
						availableInlineExtentPt: e.availableBounds.widthPt,
						suppressSpaceBefore: !1,
						continuation: Object.freeze({ boundary: null })
					});
					g.moveAcquisitionCursor(o);
					let r = Lc(n.layout, e.cursorPt.yPt);
					if (r !== null) {
						let e = u.blockExtentPt + r;
						if (e > o.availableBounds.heightPt && e <= _(f)) {
							b(hh(f.flow, "overflow"), t);
							continue;
						}
					}
				}
				let y = e.sequence[t + 1], x = y?.kind === "authored-break" && y.break === "page";
				if (s.boundary === null && x) {
					let e = Rc(u.layout);
					if (e !== null) {
						f = Zy(f, e, i.source, 0, n, c, l), u.flowRegistryDelta && g.commitFlowRegistryDelta(u.flowRegistryDelta), s = null, g.moveAcquisitionCursor(Yy(f));
						continue;
					}
				}
				let S = T(u.layout, o.availableBounds.widthPt).reservePt, C = (r[f.flow.pageIndex]?.bottom ?? 0) === 0 && f.footnoteReservePt === 0, w = Jy(f) === qy(f).blockEndPt, O = pc({
					hasContinuationBoundary: s.boundary !== null,
					inkless: i.inkless === !0,
					undecorated: eb(u.layout),
					keepNext: i.keepNext,
					markReservePt: S,
					pageBottomIsUnreserved: C,
					physicalRegionBottomIsActive: w,
					hasFollowingInk: $y(e, t + 1),
					markBelowBaselinePt: u.markBelowBaselinePt ?? 0
				}), A = ny(u.layout, s, u.lineEndBoundaries, o.availableBounds.heightPt + O, _(f), f.flow.pageHasContent, {
					keepLines: i.keepLines,
					widowControl: i.widowControl,
					authoredSpaceAfterPt: i.spaceAfterPt,
					writingMode: qy(f).writingMode
				}, (e) => T(e, o.availableBounds.widthPt).reservePt, u.uniformRubyAdvancePt, (e) => !k(e));
				if (A.requiresFreshFlowRegion) {
					b(hh(f.flow, "overflow"), t);
					continue;
				}
				if (!A.fragment) throw Error("Paragraph acquisition made no progress");
				f = Zy(f, A.fragment, i.source, Math.min(A.admittedBlockExtentPt, o.availableBounds.heightPt), n, c, l, u.placement);
				let j = T(A.fragment, o.availableBounds.widthPt);
				if (Iy(j.reservePt, A.fragment.advancePt + j.reservePt, _(f)), D(j.ids, j.layouts, j.reservePt), u.flowRegistryDelta) {
					let e = zy(u.flowRegistryDelta, A.fragment);
					e && g.commitFlowRegistryDelta(e);
				}
				s = A.nextCursor, s && b(hh(f.flow, "overflow"), t), o = Yy(f), g.moveAcquisitionCursor(o);
			}
			A = i;
		} else {
			A = null;
			let e, n = !1;
			for (; !n;) {
				let r = nb(e), a = Yy(f), o = (t) => g.measureTable({
					input: i,
					location: a,
					availableInlineExtentPt: a.availableBounds.widthPt,
					availableBlockExtentPt: t,
					freshPageBlockExtentPt: _(f),
					...e ? { cursor: e } : {}
				}), s = a.availableBounds.heightPt, u = o(s);
				if (u.retryAtBlockStartPt !== void 0) {
					if (!Number.isFinite(u.retryAtBlockStartPt) || u.retryAtBlockStartPt <= f.flow.cursorBlockPt) throw Error("Table repositioning must advance the block cursor");
					f = Object.freeze({
						...f,
						flow: Object.freeze({
							...f.flow,
							cursorBlockPt: u.retryAtBlockStartPt
						})
					}), g.moveAcquisitionCursor(Yy(f));
					continue;
				}
				let d = u.requiresFreshFlowRegion ? Object.freeze({
					ids: Object.freeze([]),
					layouts: Object.freeze([]),
					reservePt: 0
				}) : T(u.layout, a.availableBounds.widthPt), p = Object.freeze({
					reservePt: d.reservePt,
					chargePt: u.blockExtentPt + d.reservePt
				}), m = /* @__PURE__ */ new Set();
				for (; !u.requiresFreshFlowRegion && u.blockExtentPt + d.reservePt > a.availableBounds.heightPt;) {
					let e = JSON.stringify({
						advancePt: u.blockExtentPt,
						nextCursor: u.nextCursor ?? null,
						noteIds: d.ids,
						reservePt: d.reservePt
					});
					if (m.has(e)) throw Iy(p.reservePt, p.chargePt, _(f)), Error("Table footnote admission did not converge");
					m.add(e), s = Math.max(0, a.availableBounds.heightPt - d.reservePt), u = o(s), d = u.requiresFreshFlowRegion ? Object.freeze({
						ids: Object.freeze([]),
						layouts: Object.freeze([]),
						reservePt: 0
					}) : T(u.layout, a.availableBounds.widthPt), u.requiresFreshFlowRegion || (p = Object.freeze({
						reservePt: d.reservePt,
						chargePt: u.blockExtentPt + d.reservePt
					}));
				}
				if (u.requiresFreshFlowRegion) {
					Iy(p.reservePt, p.chargePt, _(f));
					let n = !f.flow.pageHasContent && u.nextCursor?.kind === "table" && u.nextCursor.floatingContinuationFrame === "fresh-text" && !(e?.kind === "table" && e.floatingContinuationFrame !== void 0);
					if (u.nextCursor?.kind === "table" && u.nextCursor.floatingContinuationFrame !== void 0 && (e = u.nextCursor), n) continue;
					b(hh(f.flow, "overflow"), t);
					continue;
				}
				if (k(d.reservePt) && f.flow.pageHasContent) {
					b(bh(f.flow, f.flow.section, "overflow"), t);
					continue;
				}
				f = Zy(f, u.layout, i.source, u.blockExtentPt, r, c, l, u.placement), D(d.ids, d.layouts, d.reservePt), u.flowRegistryDelta && g.commitFlowRegistryDelta(Ry(u.flowRegistryDelta, u.layout, An(i.source, a.flowDomainId, r))), e = u.nextCursor ?? void 0, n = e === void 0, e && b(hh(f.flow, "overflow"), t);
			}
		}
		g.moveAcquisitionCursor(Yy(f));
	}
	let M = new Set([...S.keys(), ...C.keys()]);
	for (let e of M) {
		let t = S.get(e) ?? 0, n = (C.get(e) ?? []).reduce((e, t) => e + t.advancePt, 0);
		if (t !== n) throw new J("INVALID_GEOMETRY", `Page ${e} footnote reserve ${t} does not equal retained advance ${n}`);
	}
	return Object.freeze({
		layout: ib(f, s),
		session: g,
		allocations: Object.freeze(l),
		footnoteReserveByPage: S,
		footnoteLayoutsByPage: C
	});
}
function ob(e, t) {
	return Object.freeze(e.layout.pages.map((n, r) => {
		if (n.parityBlank || Td(n.section.textDirection) !== "horizontal-tb") return Object.freeze({
			top: 0,
			bottom: 0
		});
		let i = t.get(n.sectionOccurrenceId);
		if (!i) throw Error(`Unknown body section ${n.sectionOccurrenceId}`);
		let a = Math.max(0, n.section.geometry.pageWidth - Math.abs(n.section.geometry.marginLeft) - Math.abs(n.section.geometry.marginRight)), o = (t) => {
			let o = xy(t === "header" ? i.headers : i.footers, {
				titlePage: i.titlePage,
				firstPageOfSection: by(e.layout.pages, r),
				evenAndOddHeaders: i.evenAndOddHeaders,
				displayPageNumber: n.pageNumber.displayNumber
			});
			if (o === null) return 0;
			if (!e.session.layoutStory) throw Error("Header/footer story layout requires a story-capable layout session");
			return e.session.layoutStory({
				source: o,
				pageIndex: n.pageIndex,
				section: n.section,
				container: {
					id: `story:${t}:page:${n.pageIndex}`,
					kind: t,
					bounds: {
						xPt: Math.abs(n.section.geometry.marginLeft),
						yPt: 0,
						widthPt: a,
						heightPt: n.section.geometry.pageHeight
					}
				}
			}).advancePt;
		};
		return Object.freeze({
			top: Cy(o("header"), n.section.geometry.marginTop, n.section.geometry.headerDistance),
			bottom: Cy(o("footer"), n.section.geometry.marginBottom, n.section.geometry.footerDistance)
		});
	}));
}
function sb(e, t, n, r) {
	let i = e.pages.map((i, a) => {
		if (i.parityBlank) return i;
		let o = n.get(i.sectionOccurrenceId);
		if (!o) throw Error(`Unknown body section ${i.sectionOccurrenceId}`);
		if (!t.layoutStory) {
			if (!(Object.values(o.headers).some((e) => e !== null) || Object.values(o.footers).some((e) => e !== null) || (r.get(i.pageIndex)?.length ?? 0) > 0)) return i;
			throw Error("Page-story composition requires a story-capable layout session");
		}
		let s = Td(i.section.textDirection) !== "horizontal-tb", c = s ? bc(i.section.geometry) : i.section.geometry, l = Math.abs(c.marginLeft), u = Math.max(0, c.pageWidth - Math.abs(c.marginLeft) - Math.abs(c.marginRight)), d = s ? "upright-physical" : "section-logical", f = s ? Object.freeze({
			...i.section,
			geometry: Object.freeze({ ...c }),
			columns: Object.freeze([Object.freeze({
				xPt: l,
				wPt: u
			})]),
			textDirection: "lrTb"
		}) : i.section, p = (t) => xy(t === "header" ? o.headers : o.footers, {
			titlePage: o.titlePage,
			firstPageOfSection: by(e.pages, a),
			evenAndOddHeaders: o.evenAndOddHeaders,
			displayPageNumber: i.pageNumber.displayNumber
		}), m = (e) => {
			let n = p(e);
			if (n === null) return null;
			let r = t.layoutStory({
				source: n,
				pageIndex: i.pageIndex,
				section: f,
				container: {
					id: `story:${e}:page:${i.pageIndex}`,
					kind: e,
					bounds: {
						xPt: l,
						yPt: 0,
						widthPt: u,
						heightPt: c.pageHeight
					}
				}
			});
			return jy(r, {
				xPt: 0,
				yPt: (e === "header" ? c.headerDistance : c.pageHeight - c.footerDistance - r.advancePt) - r.flowBounds.yPt
			});
		}, h = m("header"), g = m("footer"), _ = r.get(i.pageIndex) ?? [], v = _.reduce((e, t) => e + t.advancePt, 0), y = i.sectionRegions[0], b = (y?.blockEndPt ?? Math.max(0, i.section.geometry.pageHeight - Math.abs(i.section.geometry.marginBottom))) - v, x = b, S = _.map((e) => {
			let t = My(e, {
				xPt: 0,
				yPt: x - e.flowBounds.yPt
			});
			return x += e.advancePt, t;
		}), C = S.length === 0 ? 0 : Math.min(...S.map((e) => e.flowBounds.xPt)), w = S.length === 0 ? 0 : Math.max(...S.map((e) => e.flowBounds.xPt + e.flowBounds.widthPt)), T = Object.freeze({
			xPt: C,
			yPt: b,
			widthPt: w - C,
			heightPt: v
		}), E = y ? Object.freeze(Fd(y.coordinateSpace.logicalToPhysical, T)) : T, D = [
			...h ? [Object.freeze({
				id: `story:header:page:${i.pageIndex}`,
				kind: "header",
				logicalBounds: Object.freeze({
					xPt: l,
					yPt: h.flowBounds.yPt,
					widthPt: u,
					heightPt: h.advancePt
				}),
				physicalBounds: Object.freeze({
					xPt: l,
					yPt: h.flowBounds.yPt,
					widthPt: u,
					heightPt: h.advancePt
				})
			})] : [],
			...S.length > 0 ? [Object.freeze({
				id: `notes:page:${i.pageIndex}`,
				kind: "footnote",
				...y ? { sectionRegionId: y.id } : {},
				logicalBounds: T,
				physicalBounds: E
			})] : [],
			...g ? [Object.freeze({
				id: `story:footer:page:${i.pageIndex}`,
				kind: "footer",
				logicalBounds: Object.freeze({
					xPt: l,
					yPt: g.flowBounds.yPt,
					widthPt: u,
					heightPt: g.advancePt
				}),
				physicalBounds: Object.freeze({
					xPt: l,
					yPt: g.flowBounds.yPt,
					widthPt: u,
					heightPt: g.advancePt
				})
			})] : []
		], O = i.layers.roots.map((e) => e), k = O.findIndex((e) => e.layer !== "background" && e.layer !== "behindText"), A = k < 0 ? O.length : k, j = [
			...O.slice(0, A),
			...h?.blocks.map((e) => ({
				layer: "header",
				node: e,
				coordinateSpace: d
			})) ?? [],
			...O.slice(A)
		], M = -1;
		for (let e = 0; e < j.length; e += 1) j[e].layer === "body" && (M = e);
		let N = M < 0 ? j.length : M + 1, P = [
			...j.slice(0, N),
			...S.map((e) => ({
				layer: "notes",
				node: e,
				coordinateSpace: "section-logical"
			})),
			...j.slice(N),
			...g?.blocks.map((e) => ({
				layer: "footer",
				node: e,
				coordinateSpace: d
			})) ?? []
		];
		return Object.freeze({
			...i,
			flowDomains: Object.freeze([...i.flowDomains, ...D]),
			layers: hd(P),
			readingOrder: Object.freeze([
				...h?.blocks.map((e) => e.id) ?? [],
				...i.readingOrder,
				...S.map((e) => e.id),
				...g?.blocks.map((e) => e.id) ?? []
			])
		});
	});
	return Object.freeze({
		...e,
		pages: Object.freeze(i)
	});
}
function cb(e, t, n) {
	if (n.length === 0) return e;
	let r = -1;
	for (let t = e.pages.length - 1; t >= 0; --t) if (!e.pages[t].parityBlank) {
		r = t;
		break;
	}
	if (r < 0) return e;
	let i = e.pages[r];
	if (!t.layoutNotes) return Object.freeze({
		...e,
		diagnostics: Object.freeze([...e.diagnostics, Object.freeze({
			code: "UNSUPPORTED_FEATURE",
			severity: "error",
			source: Object.freeze({
				story: "endnote",
				storyInstance: n[0],
				path: Object.freeze([])
			}),
			message: "Document-end notes require a note-capable layout session"
		})])
	});
	let a = new Map(i.flowDomains.map((e) => [e.id, e])), o = i.layers.body.filter((e) => e.ordinaryFlow && a.get(e.flowDomainId)?.kind === "body").reduce((e, t) => e === null || t.flowBounds.yPt + t.flowBounds.heightPt > e.flowBounds.yPt + e.flowBounds.heightPt ? t : e, null), s = o ? a.get(o.flowDomainId) : [...i.flowDomains].reverse().find((e) => e.kind === "body");
	if (!s) return Object.freeze({
		...e,
		diagnostics: Object.freeze([...e.diagnostics, Object.freeze({
			code: "UNSUPPORTED_FEATURE",
			severity: "error",
			message: "Document-end notes require a retained body flow domain"
		})])
	});
	let c = i.sectionRegions.find((e) => e.flowDomainIds.includes(s.id)) ?? i.sectionRegions[0], l = o ? o.flowBounds.yPt + o.flowBounds.heightPt : s.logicalBounds.yPt, u = i.layers.notes.filter((e) => e.kind === "note" && e.source.story === "footnote").reduce((e, t) => Math.min(e, t.flowBounds.yPt), s.logicalBounds.yPt + s.logicalBounds.heightPt), d = Math.min(s.logicalBounds.yPt + s.logicalBounds.heightPt, u), f = `endnotes:page:${i.pageIndex}`;
	try {
		let a = t.layoutNotes({
			kind: "endnote",
			referenceIds: Object.freeze([...n]),
			pageIndex: i.pageIndex,
			section: c?.section ?? i.section,
			container: {
				id: f,
				kind: "endnote",
				bounds: {
					xPt: s.logicalBounds.xPt,
					yPt: l,
					widthPt: s.logicalBounds.widthPt,
					heightPt: Math.max(0, d - l)
				}
			},
			firstOnPage: !0
		});
		if (a.length === 0) return e;
		let o = a.reduce((e, t) => e + t.advancePt, 0), u = Object.freeze({
			xPt: s.logicalBounds.xPt,
			yPt: l,
			widthPt: s.logicalBounds.widthPt,
			heightPt: o
		}), p = Object.freeze({
			id: f,
			kind: "endnote",
			...c ? { sectionRegionId: c.id } : {},
			logicalBounds: u,
			physicalBounds: c ? Object.freeze(Fd(c.coordinateSpace.logicalToPhysical, u)) : u
		}), m = i.layers.roots.map((e) => e), h = -1;
		for (let e = 0; e < m.length; e += 1) m[e].layer === "body" && (h = e);
		h += 1, m.splice(h, 0, ...a.map((e) => ({
			layer: "notes",
			node: e,
			coordinateSpace: "section-logical"
		})));
		let g = new Set(i.layers.body.map((e) => e.id)), _ = -1;
		for (let e = 0; e < i.readingOrder.length; e += 1) g.has(i.readingOrder[e]) && (_ = e);
		_ += 1;
		let v = [...i.readingOrder];
		v.splice(_, 0, ...a.map((e) => e.id));
		let y = [...e.pages];
		return y[r] = Object.freeze({
			...i,
			flowDomains: Object.freeze([...i.flowDomains, p]),
			layers: hd(m),
			readingOrder: Object.freeze(v)
		}), Object.freeze({
			...e,
			pages: Object.freeze(y)
		});
	} catch (t) {
		if (!(t instanceof Am) || t.kind !== "endnote" || t.pageIndex !== i.pageIndex || t.containerId !== f) throw t;
		return Object.freeze({
			...e,
			diagnostics: Object.freeze([...e.diagnostics, Object.freeze({
				code: "UNSUPPORTED_FEATURE",
				severity: "error",
				source: Object.freeze({
					story: "endnote",
					storyInstance: n[0],
					path: Object.freeze([])
				}),
				message: `Document-end notes do not fit the retained terminal flow region: ${t instanceof Error ? t.message : String(t)}`
			})])
		});
	}
}
function lb(e, t, n, r) {
	return Object.freeze({
		...e,
		diagnostics: Object.freeze([...e.diagnostics, Object.freeze({
			code: "UNSUPPORTED_FEATURE",
			severity: "error",
			message: `Unsupported ${t} position ${JSON.stringify(n)}; retained layout uses the ${r} fallback`
		})])
	});
}
function ub(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.pages) for (let e of n.layers.body) if (e.kind === "paragraph") for (let r of e.drawings) {
		let i = r.anchorLayer;
		if (!i || i.horizontalOwnership !== "page" || i.verticalOwnership !== "page") continue;
		let a = i.acquisitionOccurrenceId ?? i.occurrenceId;
		t.set(a, Object.freeze({
			occurrenceId: a,
			paragraphSource: e.source,
			pageIndex: n.pageIndex,
			flowDomainId: e.flowDomainId
		}));
	}
	return t;
}
function db(e) {
	return JSON.stringify([...e].sort(([e], [t]) => e.localeCompare(t)));
}
function fb(e, t, n, r, i) {
	if (!e.sequence.some((e) => e.kind === "body-block" && e.block.kind === "paragraph" && (e.block.pageOwnedAnchorOccurrenceIds?.length ?? 0) > 0)) return ab(e, t, n, r, null, i);
	try {
		return Ma({
			step: (a) => {
				let o = ab(e, t, n, r, a?.plan ?? null, i);
				return Object.freeze({
					pass: o,
					plan: ub(o.layout)
				});
			},
			stateOf: (e) => db(e.plan),
			limit: 16
		}).value.pass;
	} catch (e) {
		throw e instanceof ja ? new J("NON_CONVERGENCE", e.reason === "cycle" ? "Page-anchor destination acquisition repeated an exact-state cycle" : "Page-anchor destination acquisition reached the operational pass limit 16") : e;
	}
}
function pb(e) {
	let t = [], n = e.initialSection;
	for (let r of e.sequence) r.kind === "begin-section" && (r.section.startType === "continuous" && t.push(Object.freeze({
		outgoingSectionOccurrenceId: n.sectionOccurrenceId,
		incomingSectionOccurrenceId: r.section.sectionOccurrenceId
	})), n = r.section);
	return Object.freeze(t);
}
function mb(e, t, n) {
	for (let r of e.pages) for (let e = 0; e + 1 < r.sectionRegions.length; e += 1) {
		let i = r.sectionRegions[e], a = r.sectionRegions[e + 1];
		if (i.sectionOccurrenceId === t && a.sectionOccurrenceId === n) return Object.freeze({
			page: r,
			outgoing: i
		});
	}
	return null;
}
function hb(e, t, n, r) {
	let i = /* @__PURE__ */ new Map(), a = fb(e, t, n, r, i);
	for (let o of pb(e)) {
		let s = mb(a.layout, o.outgoingSectionOccurrenceId, o.incomingSectionOccurrenceId);
		if (s === null || s.outgoing.flowDomainIds.length < 2) continue;
		let c = s.page.pageIndex, l = gy(e, a.allocations, a.footnoteReserveByPage, s.page, s.outgoing), u = new Map(i);
		u.set(o.outgoingSectionOccurrenceId, Object.freeze({
			pageIndex: c,
			targetPt: l
		})), i = u, a = fb(e, t, n, r, i);
	}
	return a;
}
function gb(e, t, n) {
	t = qu(t);
	let r = By(e), i = hb(e, t, n, []), a = wy({
		seed: i,
		measure: (e) => ob(e, r),
		repaginate: (r, i) => {
			let a = Qg(i.layout);
			return hb(e, Yu(t, {
				totalPages: i.layout.pages.length,
				resolveDestinationPage: (e) => a[e]
			}), n, r);
		},
		identity: (e) => Qg(e.layout),
		requiresConvergence: i.session.hasPaginationFields
	}).result, o = vy(a.layout, a.session, a.allocations), s = e.noteLayoutSettings ?? Object.freeze({
		footnotePosition: "pageBottom",
		endnotePosition: "docEnd"
	}), c = sb(o, a.session, r, a.footnoteLayoutsByPage), l = c.pages.some((e) => e.layers.notes.some((e) => e.source.story === "footnote")) && s.footnotePosition !== "pageBottom" ? lb(c, "footnote", s.footnotePosition, "pageBottom") : c, u = new Set(o.pages.flatMap((e) => e.layers.body.flatMap((e) => e.kind === "paragraph" || e.kind === "table" ? dy(e) : []))), d = (e.endnoteIds ?? []).filter((e) => u.has(e)), f = cb(l, a.session, d), p = d.length > 0 && s.endnotePosition !== "docEnd" ? lb(f, "endnote", s.endnotePosition, "docEnd") : f, m = e.parserDiagnostics ?? [];
	return Jf(m.length === 0 ? p : Object.freeze({
		...p,
		diagnostics: Object.freeze([...m, ...p.diagnostics])
	}));
}
//#endregion
//#region packages/docx/src/layout/document.ts
function _b(e, t, n = Sd(void 0, Date.now())) {
	return gb(e, t, n);
}
function vb(e, t, n) {
	if (Vu(e)) return;
	let { model: r, input: i } = n();
	Zf({
		model: r,
		services: e,
		defaultCurrentDateMs: t,
		buildLayout: (t) => _b(i, e, t)
	});
}
//#endregion
//#region packages/docx/src/paint/browser-math.ts
function yb(e) {
	let t = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(e)}`, n = new Image();
	return new Promise((e, r) => {
		n.onload = () => e(n), n.onerror = r, n.src = t;
	});
}
async function bb(e, t) {
	if (e.length === 0) return {
		records: [],
		drawables: /* @__PURE__ */ new Map()
	};
	await t.loadMathJax();
	let n = [], r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Set();
	for (let a of e) {
		if (i.has(a.resourceKey)) throw Error(`Duplicate math occurrence: ${a.resourceKey}`);
		i.add(a.resourceKey);
		try {
			let e = await t.mathMLToSvg(p(a.nodes, a.display)), i = await yb(Qe(e.svg, "#000000"));
			n.push({
				resourceKey: a.resourceKey,
				widthEm: e.widthEm,
				ascentEm: e.ascentEm,
				descentEm: e.descentEm,
				diagnostics: []
			}), r.set(a.resourceKey, i);
		} catch {
			n.push({
				resourceKey: a.resourceKey,
				widthEm: 0,
				ascentEm: 0,
				descentEm: 0,
				available: !1,
				diagnostics: [{
					code: "UNSUPPORTED_FEATURE",
					severity: "warning",
					message: "Math conversion failed; using the deterministic text fallback"
				}]
			});
		}
	}
	return {
		records: n,
		drawables: r
	};
}
//#endregion
//#region packages/docx/src/frame-geometry.ts
function xb(e, t) {
	switch (e) {
		case "margin": return {
			left: t.marginLeft,
			right: t.pageWidth - t.marginRight
		};
		case "page": return {
			left: 0,
			right: t.pageWidth
		};
		default: return {
			left: t.contentX,
			right: t.contentX + t.contentW
		};
	}
}
function Sb(e, t, n, r) {
	switch (e) {
		case "margin": return {
			start: r.marginTop,
			end: r.pageH - r.marginBottom
		};
		case "page": return {
			start: 0,
			end: r.pageH
		};
		default: return {
			start: t,
			end: t + n
		};
	}
}
function Cb(e, t, n, r) {
	switch (e) {
		case "center": return t + (n - t - r) / 2;
		case "right":
		case "outside": return n - r;
		default: return t;
	}
}
function wb(e, t, n) {
	switch (e) {
		case "center": return t.start + (t.end - t.start - n) / 2;
		case "bottom":
		case "outside": return t.end - n;
		default: return t.start;
	}
}
function Tb(e, t, n) {
	return e + t <= n.end ? e : Math.max(n.start, n.end - t);
}
function Eb(e, t, n, r, i, a) {
	let o = e.dropCap === "drop" || e.dropCap === "margin", s = xb(e.hAnchor, t), c = Sb(e.vAnchor, n, i, t), l = e.w == null ? r : e.w, u;
	if (o) u = Math.max(1, e.lines) * a;
	else {
		let t = e.h ?? 0;
		u = e.hRule === "exact" ? t : e.hRule === "atLeast" ? Math.max(t, i) : i;
	}
	let d;
	d = e.dropCap === "drop" ? s.left : e.dropCap === "margin" ? s.left - l : e.xAlign ? Cb(e.xAlign, s.left, s.right, l) : s.left + (e.x ?? 0);
	let f;
	f = o ? c.start : e.yAlign && e.vAnchor !== "text" ? wb(e.yAlign, c, u) : c.start + (e.y ?? 0), (e.vAnchor === "page" || e.vAnchor === "margin") && (f = Tb(f, u, c));
	let p = e.wrap === "around" || e.wrap === "auto" ? e.hSpace : 0, m = e.vSpace;
	return {
		x: d,
		y: f,
		w: l,
		h: u,
		exLeft: d - p,
		exRight: d + l + p,
		exTop: f - m,
		exBottom: f + u + m
	};
}
function Db(e, t) {
	if (t.kind === "table" && t.tableOverlap === void 0) throw Error("Floating-table transport omitted tblOverlap");
	let n = t.x, r = t.y;
	if (t.avoidOverlap) {
		let i = {
			occurrenceId: "display-moving-float",
			paragraphId: t.paraId,
			bounds: {
				xPt: n,
				yPt: r,
				widthPt: t.w,
				heightPt: t.h
			},
			exclusionBounds: {
				xPt: n - t.dl,
				yPt: r - t.dt,
				widthPt: t.w + t.dl + t.dr,
				heightPt: t.h + t.dt + t.db
			}
		}, a = Hi({
			moving: t.kind === "table" ? {
				...i,
				kind: "table",
				tableOverlap: t.tableOverlap
			} : {
				...i,
				kind: t.kind === "frame" ? "frame" : "drawingml"
			},
			blockers: e.floats.map(Ii),
			avoidance: t.kind === "table" ? Ni(t.tableOverlap, t.paraId) : Pi(t.allowOverlap ?? !0, t.paraId),
			rightBoundaryPt: e.pageWidth,
			overlapEpsilonPt: ji,
			rightBoundarySlackPt: Mi
		});
		n = a.bounds.xPt, r = a.bounds.yPt;
	}
	let i = {
		mode: t.mode,
		imageKey: t.imageKey,
		imageX: n,
		imageY: r,
		imageW: t.w,
		imageH: t.h,
		xLeft: n - t.dl,
		xRight: n + t.w + t.dr,
		yTop: r - t.dt,
		yBottom: r + t.h + t.db,
		side: t.side,
		distLeft: t.dl,
		distRight: t.dr,
		distTop: t.dt,
		distBottom: t.db,
		paraId: t.paraId
	}, a = t.kind === "table" ? {
		...i,
		kind: "table",
		tableOverlap: t.tableOverlap
	} : {
		...i,
		kind: t.kind
	};
	return e.floats.push(a), a;
}
//#endregion
//#region packages/docx/src/layout/floating-table-transaction.ts
function Ob(e) {
	return e.xPt + e.widthPt;
}
function kb(e) {
	return e.yPt + e.heightPt;
}
function Ab(e, t, n, r) {
	return e === "center" ? t + (n - t - r) / 2 : e === "right" || e === "outside" ? n - r : t;
}
function jb(e, t, n, r) {
	return e === "center" ? t + (n - t - r) / 2 : e === "bottom" || e === "outside" ? n - r : t;
}
function Mb(e, t, n, r, i = !1) {
	let a = e.horzSpecified ? e.horzAnchor === "page" ? t.page : e.horzAnchor === "margin" ? t.margin : t.text : t.text, o = e.vertAnchor === "page" ? t.page : e.vertAnchor === "margin" ? t.margin : t.text, s = e.xAlign ? Ab(e.xAlign, a.xPt, Ob(a), n) : a.xPt + e.xPt, c = e.yAlign && e.vertAnchor !== "text" ? jb(e.yAlign, o.yPt, kb(o), r) : o.yPt + e.yPt;
	return !i && (e.vertAnchor === "page" || e.vertAnchor === "margin") && c + r > kb(o) && (c = Math.max(o.yPt, kb(o) - r)), Object.freeze({
		x: s,
		y: c,
		w: n,
		h: r
	});
}
function Nb(e, t, n, r) {
	return Mb(e, t, n, r);
}
function Pb(e, t, n) {
	let r = e.child.columnWidthsPt.reduce((e, t) => e + t, 0), i = e.child.advancePt, a = e.positioning, o = Object.freeze({
		xPt: t,
		yPt: n,
		widthPt: r,
		heightPt: i
	}), s = Object.freeze({
		xPt: t - a.leftFromTextPt,
		yPt: n - a.topFromTextPt,
		widthPt: r + a.leftFromTextPt + a.rightFromTextPt,
		heightPt: i + a.topFromTextPt + a.bottomFromTextPt
	});
	return Object.freeze({
		kind: "resolved-floating-table-placement",
		occurrenceId: e.occurrenceId,
		xPt: t,
		yPt: n,
		bounds: o,
		exclusionBounds: s,
		overlap: e.overlap,
		child: e.child,
		source: e
	});
}
function Fb(e, t) {
	let n = e.child.columnWidthsPt.reduce((e, t) => e + t, 0), r = e.child.advancePt, i = Nb(e.positioning, t, n, r), a = Rm(e.positioning);
	return Pb(e, a.x && e.acquiredTextOffsetPt ? t.text.xPt + e.acquiredTextOffsetPt.xPt : i.x, a.y && e.acquiredTextOffsetPt ? t.text.yPt + e.acquiredTextOffsetPt.yPt : i.y);
}
function Ib(e, t, n) {
	return Object.freeze({
		coordinateSpace: e.coordinateSpace,
		flowDomainId: e.flowDomainId,
		baseEntries: e.entries,
		baseNextParagraphId: e.nextParagraphId,
		nextParagraphId: n,
		entries: Object.freeze([...t])
	});
}
function Lb(e, t) {
	if (t.coordinateSpace !== e.coordinateSpace || t.flowDomainId !== e.flowDomainId || t.entries !== e.baseEntries || t.nextParagraphId !== e.baseNextParagraphId) throw Error("Floating table registry delta base/domain mismatch");
	let n = new Set(t.entries.map((e) => e.occurrenceId));
	if (e.entries.some((e) => n.has(e.occurrenceId))) throw Error("Floating table registry delta was already committed");
	if (e.nextParagraphId !== e.baseNextParagraphId + e.entries.length) throw Error("Floating table registry delta sequence mismatch");
}
function Rb(e, t, n = "logical-page-points", r = "logical-page") {
	let i = /* @__PURE__ */ new Set();
	for (let t of e) {
		if (i.has(t.occurrenceId)) throw Error(`Duplicate float registry occurrence: ${t.occurrenceId}`);
		i.add(t.occurrenceId);
	}
	return Object.freeze({
		coordinateSpace: n,
		flowDomainId: r,
		base: Object.freeze([...e]),
		delta: Object.freeze([]),
		nextParagraphId: t
	});
}
function zb(e, t, n) {
	let r = [...n.base, ...n.delta], i = r.find((t) => t.occurrenceId === e.occurrenceId);
	if (i) return Object.freeze({
		placement: Object.freeze({
			...Pb(e, i.bounds.xPt, i.bounds.yPt),
			bounds: i.bounds,
			exclusionBounds: i.exclusionBounds
		}),
		transaction: n
	});
	let a = Fb(e, t), o = Hi({
		moving: {
			occurrenceId: e.occurrenceId,
			kind: "table",
			tableOverlap: e.overlap,
			paragraphId: n.nextParagraphId,
			bounds: a.bounds,
			exclusionBounds: a.exclusionBounds
		},
		blockers: r.filter((e) => e.kind !== "shape" || e.wrap !== void 0).map(Fi),
		avoidance: Ni(e.overlap, n.nextParagraphId),
		rightBoundaryPt: Ob(t.page),
		overlapEpsilonPt: ji,
		rightBoundarySlackPt: Mi
	}), s = Pb(e, o.bounds.xPt, o.bounds.yPt), c = Object.freeze({
		kind: "table",
		occurrenceId: e.occurrenceId,
		overlap: e.overlap,
		paragraphId: n.nextParagraphId,
		bounds: s.bounds,
		exclusionBounds: s.exclusionBounds
	});
	return Object.freeze({
		placement: s,
		transaction: Object.freeze({
			coordinateSpace: n.coordinateSpace,
			flowDomainId: n.flowDomainId,
			base: n.base,
			delta: Object.freeze([...n.delta, c]),
			nextParagraphId: n.nextParagraphId + 1
		})
	});
}
//#endregion
//#region packages/docx/src/anchor-geometry.ts
function Bb(e, t, n) {
	let r = n.pageWidth, i = n.marginLeft, a = n.marginRight;
	switch (e ?? (t ? "margin" : "page")) {
		case "page": return {
			start: 0,
			end: r
		};
		case "leftMargin": return {
			start: 0,
			end: i
		};
		case "rightMargin": return {
			start: r - a,
			end: r
		};
		case "insideMargin": return {
			start: 0,
			end: i
		};
		case "outsideMargin": return {
			start: r - a,
			end: r
		};
		case "character":
		case "column": return {
			start: n.contentX,
			end: n.contentX + n.contentW
		};
		default: return {
			start: i,
			end: r - a
		};
	}
}
function Vb(e, t, n, r) {
	let i = r.marginTop, a = r.marginBottom;
	switch (e ?? (t ? "paragraph" : "page")) {
		case "page": return {
			start: 0,
			end: r.pageH
		};
		case "topMargin": return {
			start: 0,
			end: i
		};
		case "bottomMargin": return {
			start: r.pageH - a,
			end: r.pageH
		};
		case "paragraph":
		case "line": return {
			start: n,
			end: r.pageH
		};
		default: return {
			start: i,
			end: r.pageH - a
		};
	}
}
function Hb(e, t, n, r, i, a, o, s) {
	let c = Bb(a, t, i);
	if (o != null) return c.start + (c.end - c.start) * o + n;
	if (!e) return c.start + n;
	let l = c.end - c.start, u = s ?? r, d = s == null ? 0 : n;
	switch (e) {
		case "center": return c.start + (l - u) / 2 + d;
		case "right":
		case "outside": return c.end - u + d;
		default: return c.start + d;
	}
}
function Ub(e, t, n, r, i, a, o, s, c) {
	let l = Vb(o, t, i, a);
	if (s != null) return l.start + (l.end - l.start) * s + n;
	if (!e) return l.start + n;
	let u = l.end - l.start, d = c ?? r, f = c == null ? 0 : n;
	switch (e) {
		case "center": return l.start + (u - d) / 2 + f;
		case "bottom":
		case "outside": return l.end - d + f;
		default: return l.start + f;
	}
}
//#endregion
//#region packages/docx/src/layout/section-orientation.ts
function Wb(e) {
	return Gb(e.textDirection);
}
function Gb(e) {
	return typeof e == "string" && xc(e);
}
function Kb(e) {
	return e === "btLr";
}
function qb(e) {
	return {
		...e,
		...yc(e)
	};
}
function Jb(e) {
	return {
		...e,
		...bc(e)
	};
}
//#endregion
//#region packages/docx/src/layout/measurement-environment.ts
function Yb(e) {
	for (let t of e.body) {
		if (t.type !== "paragraph") continue;
		let e = t;
		if (typeof e.defaultFontSize == "number") return e.defaultFontSize;
		for (let t of e.runs) if (t.type === "text") return t.fontSize;
	}
	return 10;
}
function Xb(e) {
	return {
		pageIndex: e.pageIndex,
		totalPages: e.totalPages,
		displayPageNumber: e.displayPageNumber,
		pageNumberFormat: e.pageNumberFormat,
		currentDateMs: e.currentDateMs,
		noteNumbers: e.noteNumbers,
		noteReferenceNumber: e.noteReferenceNumber,
		pageWritingMode: Td(e.sectionLayout.textDirection),
		verticalCJK: e.verticalCJK && !e.verticalAllRotated,
		verticalPageFrame: e.verticalCJK === !0,
		documentHasEastAsianText: e.docEastAsian,
		useFeLayout: e.layoutSettings.compat.useFeLayout,
		characterSpacingControl: e.layoutSettings.characterSpacingControl,
		resolvedLocalFonts: e.resolvedLocalFonts,
		layoutServices: e.layoutServices,
		verticalGlyphMeasurement: e.verticalGlyphMeasurement
	};
}
function Zb(e, t) {
	return {
		type: e.sectionLayout.grid.kind === "none" ? null : e.sectionLayout.grid.kind,
		linePitchPt: t.lineGrid.active ? t.lineGrid.pitchPt : null,
		charSpacePt: t.characterGrid.active ? t.characterGrid.deltaPt : null
	};
}
//#endregion
//#region packages/docx/src/layout/acquisition-state.ts
var Qb = Object.freeze({
	story: "body",
	containers: Object.freeze([]),
	lineNumberingEligible: !0
});
function $b(e) {
	let t = Math.max(0, e.pageH - e.marginTop - e.marginBottom);
	return {
		page: {
			xPt: 0,
			yPt: 0,
			widthPt: e.pageWidth,
			heightPt: e.pageH
		},
		margin: {
			xPt: e.marginLeft,
			yPt: e.marginTop,
			widthPt: Math.max(0, e.pageWidth - e.marginLeft - e.marginRight),
			heightPt: t
		},
		column: {
			xPt: e.contentX,
			yPt: e.marginTop,
			widthPt: e.contentW,
			heightPt: t
		},
		pageParity: e.pageIndex % 2 == 0 ? "odd" : "even"
	};
}
function ex(e, t, n) {
	return Ds(n, {
		numbering: t.numbering,
		...t.numbering ? { markerInput: e.acquisitionInputs.numberingMarkerShapeInput(t.numbering, xo(t)) } : {},
		authoredFirstIndentPt: t.indentFirst,
		tabStops: t.tabStops,
		defaultTabPt: e.defaultTabPt,
		service: e.layoutServices?.text
	});
}
function tx(e, t) {
	return ex(e, t, uc(e.layoutSettings, e.sectionLayout, Qb, t));
}
function nx(e, t) {
	return ex(e, t, uc(e.layoutSettings, e.sectionLayout, e.storyContext ?? Qb, t));
}
function rx(e) {
	return {
		...e,
		storyContext: $s(e.storyContext ?? Qb)
	};
}
function ix(e, t) {
	let n = e.retainedTablesBySourceIndex?.get(t);
	if (!n) throw Error("Table placement requires retained table acquisition");
	return n;
}
//#endregion
//#region packages/docx/src/layout/table-cell-blocks.ts
function ax(e, t) {
	if (t !== e.length - 1 || t === 0) return !1;
	let n = e[t], r = e[t - 1];
	return n?.type === "paragraph" && r?.type === "table" && n.runs.length === 0;
}
function ox(e, t) {
	let { cell: n, table: r, cellTotalWidthPt: i, outerState: a, sourcePath: o } = e, s = t.resolveContentWidthPt(n, r, i), c = t.createCellState(a, s, n), l = [];
	for (let e = 0; e < n.content.length; e += 1) {
		let r = n.content[e];
		if (!r) continue;
		let i = [...o, e];
		if (r.type === "paragraph") {
			let a = n.content[e - 1], o = n.content[e + 1], u = r, d = t.acquireParagraph(c, u, s, i, Ws(a?.type === "paragraph" ? a : null, u, o?.type === "paragraph" ? o : null));
			l.push(d), t.advanceState(c, d.advancePt);
			continue;
		}
		let a = r, u = r;
		l.push(t.acquireNestedTable(c, a, s, i, {
			fromPrevious: u.nestedSliceContinuesFromPrevious ?? !1,
			onNext: u.nestedSliceContinuesOnNext ?? !1
		}, (e, n, r, i, a) => ox({
			cell: e,
			table: n,
			cellTotalWidthPt: r,
			outerState: i,
			sourcePath: a
		}, t)));
	}
	return l;
}
//#endregion
//#region packages/docx/src/cell-border-conflict.ts
function sx(e) {
	return el(e.style, e.width);
}
function cx(e) {
	let t = Qc.indexOf(e);
	return t === -1 ? Qc.length : t;
}
function lx(e) {
	if (!e) return {
		r: 0,
		g: 0,
		b: 0
	};
	let t = e.replace(/^#/, "");
	return t.length !== 6 || /[^0-9a-fA-F]/.test(t) ? {
		r: 0,
		g: 0,
		b: 0
	} : {
		r: parseInt(t.slice(0, 2), 16),
		g: parseInt(t.slice(2, 4), 16),
		b: parseInt(t.slice(4, 6), 16)
	};
}
function ux(e, t) {
	let n = lx(e), r = lx(t), i = (e) => e.r + e.b + 2 * e.g, a = (e) => e.b + 2 * e.g, o = (e) => e.g;
	for (let e of [
		i,
		a,
		o
	]) {
		let t = e(n) - e(r);
		if (t !== 0) return t;
	}
	return 0;
}
function dx(e, t) {
	if (tl(e?.spec.style, t?.spec.style)) return null;
	let n = e && e.spec.style !== "none" ? e : null, r = t && t.spec.style !== "none" ? t : null;
	if (!n && !r) return null;
	if (!n) return r;
	if (!r || n.source === "cell" && r.source === "table") return n;
	if (r.source === "cell" && n.source === "table") return r;
	let i = sx(n.spec), a = sx(r.spec);
	if (i !== a) return i > a ? n : r;
	let o = cx(n.spec.style), s = cx(r.spec.style);
	if (o !== s) return o < s ? n : r;
	let c = ux(n.spec.color, r.spec.color);
	return c === 0 || c < 0 ? n : r;
}
//#endregion
//#region packages/docx/src/layout/table-border-layer.ts
function fx(...e) {
	for (let t of e) if (t && qc(t.authoredStyle)) return t;
	return null;
}
//#endregion
//#region packages/docx/src/layout/table.ts
function px(e) {
	return Math.max(0, e.advancePt - e.spacing.beforePt - e.spacing.afterPt);
}
function mx(e) {
	let t = [], n = 0, r = null, i = 0, a, o = 0, s = null, c = null;
	for (let l of e) {
		let e = l.layout;
		if (e.kind === "paragraph") {
			let u = e.spacing.beforePt, d = e.spacing.afterPt, f = r ? Xg(r, e, i, u) : u, p = l.structuralTrailing ? 0 : px(e), m = n + (l.structuralTrailing ? 0 : f);
			if (t.push({
				layout: e,
				offsetPt: m,
				advancePt: p
			}), l.structuralTrailing || (n = m + p, a ??= m, o = Math.max(o, n), r = e, i = d), e.cellContainmentBounds) {
				let t = m + e.cellContainmentBounds.yPt - e.flowBounds.yPt, n = t + e.cellContainmentBounds.heightPt;
				a = a === void 0 ? t : Math.min(a, t), o = Math.max(o, n), s = s === null ? t : Math.min(s, t), c = c === null ? n : Math.max(c, n);
			}
			continue;
		}
		r && (n += i);
		let u = e.advancePt;
		t.push({
			layout: e,
			offsetPt: n,
			advancePt: u
		}), a ??= n, n += u, o = n, r = null, i = 0;
	}
	let l = n + (r ? i : 0), u = a ?? 0;
	return {
		blocks: t,
		flowHeightPt: l,
		inkTopPt: u,
		inkHeightPt: Math.max(0, o - u),
		cellContainmentTopPt: s,
		cellContainmentBottomPt: c
	};
}
function hx(e) {
	let t = e.cellContainmentTopPt ?? 0, n = e.cellContainmentBottomPt ?? 0;
	return Math.max(e.flowHeightPt, n) - Math.min(0, t);
}
function gx(e) {
	return hx(mx(e));
}
function _x(e) {
	return Number.isFinite(e?.cellSpacingPt) ? Math.max(0, e?.cellSpacingPt ?? 0) : 0;
}
function vx(e, t) {
	let n = _x(e[t]), r = _x(e[t - 1]), i = _x(e[t + 1]);
	return {
		topPt: t === 0 ? n : Math.max(r, n) / 2,
		bottomPt: t === e.length - 1 ? n : Math.max(n, i) / 2
	};
}
function yx(e, t, n) {
	return n.topPt + e.margins.topPt + hx(t) + e.margins.bottomPt + n.bottomPt;
}
function bx(e, t, n, r) {
	let i = t;
	for (let a = t + 1; a < e.length && e[a]?.cells.find((e) => e.columnStart === n && e.columnSpan === r && e.verticalMerge === "continue"); a += 1) i = a;
	return i;
}
function xx(e) {
	return e.heightRule === "exact" ? Kc(e.heightPt, e.cells.map((e) => e.margins.bottomPt)) : e.heightRule === "atLeast" ? Math.max(0, e.heightPt ?? 0) : 0;
}
function Sx(e, t) {
	let n = e.map((e) => xx(e)), r = e.map((n, r) => Math.max(0, ...n.cells.filter((e) => e.verticalMerge !== "continue").map((n) => {
		let i = n.verticalMerge === "restart" ? bx(e, r, n.columnStart, n.columnSpan) : r, a = vx(e, r), o = vx(e, i);
		return yx(n, t.get(n.id) ?? mx([]), {
			topPt: a.topPt,
			bottomPt: o.bottomPt
		});
	})));
	e.forEach((r, i) => {
		let a = vx(e, i);
		for (let e of r.cells) {
			if (e.verticalMerge !== "none") continue;
			let o = yx(e, t.get(e.id) ?? mx([]), a);
			r.heightRule !== "exact" && (n[i] = Math.max(n[i] ?? 0, o));
		}
	});
	let i = [];
	e.forEach((n, r) => {
		for (let a of n.cells) a.verticalMerge === "restart" && i.push({
			start: r,
			end: bx(e, r, a.columnStart, a.columnSpan),
			requiredPt: yx(a, t.get(a.id) ?? mx([]), {
				topPt: vx(e, r).topPt,
				bottomPt: vx(e, bx(e, r, a.columnStart, a.columnSpan)).bottomPt
			})
		});
	}), i.sort((e, t) => e.end - t.end || e.start - t.start);
	for (let t of i) {
		let r = 0;
		for (let e = t.start; e <= t.end; e += 1) r += n[e] ?? 0;
		let i = t.requiredPt - r;
		if (!(i <= 0)) {
			for (let r = t.end; r >= t.start; --r) if (e[r]?.heightRule !== "exact") {
				n[r] = (n[r] ?? 0) + i;
				break;
			}
		}
	}
	return {
		heights: n,
		contentHeights: r
	};
}
function Cx(e, t) {
	return e ? {
		source: t,
		spec: {
			width: e.widthPt,
			color: e.color,
			style: e.authoredStyle
		}
	} : null;
}
function wx(e, t, n, r, i, a, o, s) {
	let c = (e, t, n, r, i, a, o) => {
		let s = fx(e, o ? t : null);
		return s ? Cx(s, "cell") : Cx(o ? fx(r, a) : fx(n, i), "table");
	}, l = c(e.borders.top, e.borders.insideH, n?.top ?? null, n?.insideH ?? null, t.top, t.insideH, r !== 0), u = c(e.borders.bottom, e.borders.insideH, n?.bottom ?? null, n?.insideH ?? null, t.bottom, t.insideH, i !== a - 1), d = c(e.borders.left, e.borders.insideV, n?.left ?? null, n?.insideV ?? null, t.left, t.insideV, e.columnStart !== 0), f = c(e.borders.right, e.borders.insideV, n?.right ?? null, n?.insideV ?? null, t.right, t.insideV, e.columnStart + e.columnSpan !== o);
	return s ? {
		top: l,
		right: d,
		bottom: u,
		left: f
	} : {
		top: l,
		right: f,
		bottom: u,
		left: d
	};
}
function Tx(e) {
	return e ? {
		widthPt: e.spec.width,
		color: e.spec.color ?? "#000000",
		authoredStyle: e.spec.style
	} : null;
}
function Ex(e, t, n) {
	let r = Tx(dx(e, t));
	return r ? {
		border: r,
		edge: n
	} : null;
}
function Dx(e) {
	let t = e.columnWidthsPt.length, n = [], r = e.rows.map(() => Array(t).fill(-1));
	return e.rows.forEach((i, a) => {
		for (let o of i.cells) {
			if (o.verticalMerge === "continue") continue;
			let i = o.verticalMerge === "restart" ? bx(e.rows, a, o.columnStart, o.columnSpan) : a, s = n.length;
			n.push({
				input: o,
				rowIndex: a,
				lastRowIndex: i
			});
			let c = Math.min(t, o.columnStart + o.columnSpan);
			for (let e = a; e <= i; e += 1) for (let t = Math.max(0, o.columnStart); t < c; t += 1) r[e][t] = s;
		}
	}), {
		owners: n,
		occupancy: r
	};
}
function Ox(e) {
	let t = e.rows.length, n = e.columnWidthsPt.length, { owners: r, occupancy: i } = Dx(e), a = (i) => {
		let a = r[i];
		return a ? wx(a.input, e.borders, e.rows[a.rowIndex]?.exceptionBorders ?? null, a.rowIndex, a.lastRowIndex, t, n, e.bidiVisual) : null;
	};
	return {
		horizontal: Array.from({ length: t + 1 }, (e, o) => Array.from({ length: n }, (e, n) => {
			let s = o > 0 ? i[o - 1]?.[n] ?? -1 : -1, c = o < t ? i[o]?.[n] ?? -1 : -1;
			if (s >= 0 && s === c) return null;
			let l = a(s), u = a(c), d = o === 0 ? "top" : o === t ? "bottom" : "between";
			return {
				above: {
					owner: r[s] ?? null,
					border: l?.bottom ?? null
				},
				below: {
					owner: r[c] ?? null,
					border: u?.top ?? null
				},
				edge: d
			};
		})),
		vertical: Array.from({ length: n + 1 }, (r, o) => Array.from({ length: t }, (t, r) => {
			let s = o > 0 ? i[r]?.[o - 1] ?? -1 : -1, c = o < n ? i[r]?.[o] ?? -1 : -1, l = e.bidiVisual ? c : s, u = e.bidiVisual ? s : c;
			return l >= 0 && l === u ? null : Ex(a(l)?.right ?? null, a(u)?.left ?? null, o === 0 ? e.bidiVisual ? "right" : "left" : o === n ? e.bidiVisual ? "left" : "right" : "between");
		})),
		occupancy: i
	};
}
function kx(e, t, n) {
	return {
		edge: e.edge,
		from: t,
		to: n,
		color: e.border.color,
		widthPt: e.border.widthPt,
		...Bd(e.border.authoredStyle, e.border.widthPt)
	};
}
var Ax = Object.freeze({
	top: null,
	right: null,
	bottom: null,
	left: null,
	insideH: null,
	insideV: null
});
function jx(e) {
	let t = Tx(e);
	return t && t.authoredStyle !== "nil" && t.authoredStyle !== "none" ? t : null;
}
function Mx(e, t, n, r, i) {
	let a = [0];
	for (let t of e.columnWidthsPt) a.push((a.at(-1) ?? 0) + t);
	let o = [0];
	for (let e of r) o.push((o.at(-1) ?? 0) + e);
	let s = a.at(-1) ?? 0, c = (n, r) => (t[n] ?? 0) + (e.bidiVisual ? s - (a[r] ?? 0) : a[r] ?? 0), l = (e) => n + (o[e] ?? 0), u = [], d = (e, t, n, r) => {
		!e || e.authoredStyle === "nil" || e.authoredStyle === "none" || u.push(kx({
			border: e,
			edge: t
		}, n, r));
	}, f = /* @__PURE__ */ new Set(), p = (t, n, r, i) => {
		let a = t.owner;
		if (!a) return;
		let o = `${n}:${r}:${a.input.id}`;
		if (f.has(o)) return;
		f.add(o);
		let s = e.rows[a.rowIndex];
		if (!s) return;
		let u = _x(s), p = c(a.rowIndex, a.input.columnStart), m = c(a.rowIndex, Math.min(e.columnWidthsPt.length, a.input.columnStart + a.input.columnSpan)), { startPt: h, endPt: g } = rr(u, a.input.columnStart, a.input.columnSpan, e.columnWidthsPt.length), _ = Math.min(p, m) + (e.bidiVisual ? g : h), v = Math.max(p, m) - (e.bidiVisual ? h : g), y = l(a.rowIndex) + vx(e.rows, a.rowIndex).topPt, b = l(a.lastRowIndex + 1) - vx(e.rows, a.lastRowIndex).bottomPt, x = wx(a.input, Ax, null, a.rowIndex, a.lastRowIndex, e.rows.length, e.columnWidthsPt.length, e.bidiVisual), S = r === "top" ? x.top : x.bottom, C = r === "top" ? y : b;
		d(jx(S), i, {
			xPt: _,
			yPt: C
		}, {
			xPt: v,
			yPt: C
		});
	};
	return i.horizontal.forEach((n, r) => {
		let a = r > 0 && _x(e.rows[r - 1]) > 0, o = r < e.rows.length && _x(e.rows[r]) > 0;
		if (a || o) {
			let a = Math.max(_x(e.rows[r - 1]), _x(e.rows[r])), u = o ? r : r - 1, f = t[u] ?? 0, m = r === 0 ? "top" : r === e.rows.length ? "bottom" : "between";
			r === 0 || r === e.rows.length ? d(fx(r === 0 ? e.rows[0]?.exceptionBorders?.top ?? null : e.rows.at(-1)?.exceptionBorders?.bottom ?? null, r === 0 ? e.borders.top : e.borders.bottom), m, {
				xPt: f,
				yPt: l(r)
			}, {
				xPt: f + s,
				yPt: l(r)
			}) : n.forEach((t, n) => {
				let o = i.occupancy[r - 1]?.[n] ?? -1, s = i.occupancy[r]?.[n] ?? -1;
				if (!t || !(o !== s && (o >= 0 || s >= 0)) || [{
					side: t.above,
					directEdge: "bottom"
				}, {
					side: t.below,
					directEdge: "top"
				}].some(({ side: e, directEdge: t }) => {
					let n = e.owner;
					return n ? Yc({
						spacingPt: a,
						directStyle: n.input.borders[t]?.authoredStyle,
						conditionalInsideStyle: n.input.borders.insideH?.authoredStyle
					}) : !1;
				})) return;
				let f = c(u, n), p = c(u, n + 1), h = fx(e.rows[r - 1]?.exceptionBorders?.insideH ?? null, e.borders.insideH), g = fx(e.rows[r]?.exceptionBorders?.insideH ?? null, e.borders.insideH);
				d(Ex(Cx(h, "table"), Cx(g, "table"), m)?.border ?? null, m, {
					xPt: Math.min(f, p),
					yPt: l(r)
				}, {
					xPt: Math.max(f, p),
					yPt: l(r)
				});
			}), n.forEach((e) => {
				e && (p(e.above, r, "bottom", e.edge), p(e.below, r, "top", e.edge));
			});
			return;
		}
		let f = [], m = /* @__PURE__ */ new Map();
		n.forEach((t) => {
			if (!t) return;
			let n = (t, n) => {
				if (!n.owner || !n.border) return;
				let r = `${t}:${n.owner.input.id}`;
				if (m.has(r)) return;
				let i = c(n.owner.rowIndex, n.owner.input.columnStart), a = c(n.owner.rowIndex, Math.min(e.columnWidthsPt.length, n.owner.input.columnStart + n.owner.input.columnSpan));
				m.set(r, {
					side: t,
					border: n.border,
					leftPt: Math.min(i, a),
					rightPt: Math.max(i, a)
				});
			};
			n("above", t.above), n("below", t.below);
		});
		let h = [...m.values()], g = [...new Set(h.flatMap((e) => [e.leftPt, e.rightPt]))].sort((e, t) => e - t), _ = r === 0 ? "top" : r === e.rows.length ? "bottom" : "between";
		for (let e = 1; e < g.length; e += 1) {
			let t = g[e - 1] ?? 0, n = g[e] ?? t;
			if (n <= t) continue;
			let r = (t + n) / 2, i = h.filter((e) => r > e.leftPt && r < e.rightPt), a = Ex(i.find((e) => e.side === "above")?.border ?? null, i.find((e) => e.side === "below")?.border ?? null, _);
			a && f.push({
				resolved: a,
				leftPt: t,
				rightPt: n
			});
		}
		f.sort((e, t) => e.leftPt - t.leftPt);
		let v = [];
		for (let e of f) {
			let t = v.at(-1);
			t && t.rightPt === e.leftPt && t.resolved.edge === e.resolved.edge && t.resolved.border.widthPt === e.resolved.border.widthPt && t.resolved.border.color === e.resolved.border.color && t.resolved.border.authoredStyle === e.resolved.border.authoredStyle ? t.rightPt = e.rightPt : v.push({ ...e });
		}
		for (let e of v) u.push(kx(e.resolved, {
			xPt: e.leftPt,
			yPt: l(r)
		}, {
			xPt: e.rightPt,
			yPt: l(r)
		}));
	}), i.vertical.forEach((t, n) => {
		t.forEach((t, r) => {
			_x(e.rows[r]) > 0 || t && u.push(kx(t, {
				xPt: c(r, n),
				yPt: l(r)
			}, {
				xPt: c(r, n),
				yPt: l(r + 1)
			}));
		});
	}), e.rows.forEach((n, r) => {
		let a = _x(n);
		if (a <= 0) return;
		let o = l(r), u = l(r + 1), f = t[r] ?? 0;
		d(fx(n.exceptionBorders?.left ?? null, e.borders.left), "left", {
			xPt: f,
			yPt: o
		}, {
			xPt: f,
			yPt: u
		}), d(fx(n.exceptionBorders?.right ?? null, e.borders.right), "right", {
			xPt: f + s,
			yPt: o
		}, {
			xPt: f + s,
			yPt: u
		});
		let p = /* @__PURE__ */ new Set();
		for (let e of n.cells) Yc({
			spacingPt: a,
			directStyle: e.borders.left?.authoredStyle,
			conditionalInsideStyle: e.borders.insideV?.authoredStyle
		}) && p.add(e.columnStart), Yc({
			spacingPt: a,
			directStyle: e.borders.right?.authoredStyle,
			conditionalInsideStyle: e.borders.insideV?.authoredStyle
		}) && p.add(e.columnStart + e.columnSpan);
		for (let t = 1; t < e.columnWidthsPt.length; t += 1) {
			let a = i.occupancy[r]?.[t - 1] ?? -1, s = i.occupancy[r]?.[t] ?? -1;
			if (!(a !== s && (a >= 0 || s >= 0))) continue;
			let l = c(r, t);
			p.has(t) || d(fx(n.exceptionBorders?.insideV ?? null, e.borders.insideV), "between", {
				xPt: l,
				yPt: o
			}, {
				xPt: l,
				yPt: u
			});
		}
		for (let t of n.cells) {
			if (t.verticalMerge === "continue") continue;
			let n = t.verticalMerge === "restart" ? bx(e.rows, r, t.columnStart, t.columnSpan) : r, i = c(r, t.columnStart), o = c(r, Math.min(e.columnWidthsPt.length, t.columnStart + t.columnSpan)), { startPt: s, endPt: u } = rr(a, t.columnStart, t.columnSpan, e.columnWidthsPt.length), f = Math.min(i, o) + (e.bidiVisual ? u : s), p = Math.max(i, o) - (e.bidiVisual ? s : u), m = l(r) + vx(e.rows, r).topPt, h = l(n + 1) - vx(e.rows, n).bottomPt, g = wx(t, Ax, null, r, n, e.rows.length, e.columnWidthsPt.length, e.bidiVisual);
			d(jx(g.right), "right", {
				xPt: p,
				yPt: m
			}, {
				xPt: p,
				yPt: h
			}), d(jx(g.left), "left", {
				xPt: f,
				yPt: m
			}, {
				xPt: f,
				yPt: h
			});
		}
	}), u;
}
function Nx(e, t, n, r, i) {
	let a = r.availableBounds, o = e === "center" ? a.xPt + (a.widthPt - i) / 2 : e === "right" ? a.xPt + a.widthPt - i : a.xPt;
	return t === 0 ? o : Jc(o, t, n);
}
function Px(e, t) {
	if (t.length === 0) return e;
	let n = Math.min(e.xPt, ...t.map((e) => Math.min(e.from.xPt, e.to.xPt) - e.widthPt / 2)), r = Math.min(e.yPt, ...t.map((e) => Math.min(e.from.yPt, e.to.yPt) - e.widthPt / 2)), i = Math.max(e.xPt + e.widthPt, ...t.map((e) => Math.max(e.from.xPt, e.to.xPt) + e.widthPt / 2)), a = Math.max(e.yPt + e.heightPt, ...t.map((e) => Math.max(e.from.yPt, e.to.yPt) + e.widthPt / 2));
	return {
		xPt: n,
		yPt: r,
		widthPt: i - n,
		heightPt: a - r
	};
}
function Fx(e, t) {
	let n = Math.max(e.xPt, t.xPt), r = Math.max(e.yPt, t.yPt), i = Math.min(e.xPt + e.widthPt, t.xPt + t.widthPt), a = Math.min(e.yPt + e.heightPt, t.yPt + t.heightPt);
	return i > n && a > r ? {
		xPt: n,
		yPt: r,
		widthPt: i - n,
		heightPt: a - r
	} : null;
}
function Ix(e, t, n) {
	let r = e.layout, i = t + (r.kind === "table" ? r.flowBounds.xPt : 0), a = n + e.offsetPt + (r.kind === "table" ? r.flowBounds.yPt : 0), o = i - r.flowBounds.xPt, s = a - r.flowBounds.yPt;
	return {
		xPt: r.inkBounds.xPt + o,
		yPt: r.inkBounds.yPt + s,
		widthPt: r.inkBounds.widthPt,
		heightPt: r.inkBounds.heightPt
	};
}
function Lx(e, t, n) {
	let r = H(e, "TableLayoutInput");
	if (r.columnWidthsPt.some((e) => !Number.isFinite(e) || e < 0)) throw TypeError("TableLayoutInput.columnWidthsPt must contain finite non-negative widths");
	let i = /* @__PURE__ */ new Map();
	r.rows.forEach((e) => e.cells.forEach((e) => {
		i.set(e.id, mx(e.verticalMerge === "continue" ? [] : e.blocks));
	}));
	let a = Ox(r), o = Sx(r.rows, i), s = o.heights, c = r.columnWidthsPt.reduce((e, t) => e + t, 0), l = s.reduce((e, t) => e + t, 0), u = t.cursor.yPt, d = r.rows.map((e) => Nx(e.alignment ?? r.alignment, Number.isFinite(e.indentPt) ? e.indentPt : r.indentPt, r.bidiVisual, t, c)), f = d[0] ?? Nx(r.alignment, r.indentPt, r.bidiVisual, t, c), p = Mx(r, d, u, s, a), m = [0];
	for (let e of r.columnWidthsPt) m.push((m.at(-1) ?? 0) + e);
	let h = [0];
	for (let e of s) h.push((h.at(-1) ?? 0) + e);
	let g = (e, t) => (d[e] ?? f) + (r.bidiVisual ? c - (m[t] ?? 0) : m[t] ?? 0), _ = r.rows.map((e, n) => {
		let a = u + (h[n] ?? 0), l = s[n] ?? 0, p = d[n] ?? f, m = vx(r.rows, n), _ = _x(e), v = e.cells.map((e) => {
			let o = e.verticalMerge === "restart" ? bx(r.rows, n, e.columnStart, e.columnSpan) : n, s = vx(r.rows, o), c = u + (h[o + 1] ?? h[n + 1] ?? 0) - s.bottomPt, d = g(n, e.columnStart), f = g(n, Math.min(r.columnWidthsPt.length, e.columnStart + e.columnSpan)), p = Math.min(d, f), v = Math.max(d, f), { startPt: y, endPt: b } = rr(_, e.columnStart, e.columnSpan, r.columnWidthsPt.length), x = p + (r.bidiVisual ? b : y), S = v - (r.bidiVisual ? y : b), C = Math.max(0, S - x), w = a + m.topPt, T = e.verticalMerge === "restart" ? Math.max(0, c - w) : Math.max(0, l - m.topPt - m.bottomPt), E = i.get(e.id) ?? mx([]), D = Math.max(0, T - e.margins.topPt - e.margins.bottomPt), O = e.margins.topPt - Math.min(0, E.inkTopPt), k = E.inkHeightPt >= D ? O : e.vAlign === "center" ? e.margins.topPt + (D - E.inkHeightPt) / 2 - E.inkTopPt : e.vAlign === "bottom" ? T - e.margins.bottomPt - E.inkHeightPt - E.inkTopPt : O, A = {
				xPt: x + e.margins.leftPt,
				yPt: w + k,
				widthPt: Math.max(0, C - e.margins.leftPt - e.margins.rightPt),
				heightPt: D
			}, j = {
				xPt: x,
				yPt: w,
				widthPt: C,
				heightPt: T
			}, M = e.verticalMerge !== "continue" && r.rows.slice(n, o + 1).every((e) => e.heightRule === "exact") ? Xc(j, t.availableBounds) : void 0, N = e.verticalMerge === "continue" ? [] : E.blocks.map((e) => ({
				...e,
				offsetPt: k + e.offsetPt
			})), P = mf([j, ...N.map((e) => Ix(e, A.xPt, j.yPt)).map((e) => M ? Fx(e, M) : e).filter((e) => e !== null)]) ?? j;
			return {
				kind: "table-cell",
				id: e.id,
				source: e.source,
				flowDomainId: r.flowDomainId,
				ordinaryFlow: r.ordinaryFlow,
				flowBounds: j,
				inkBounds: P,
				...M ? { clipBounds: M } : {},
				contentBounds: A,
				advancePt: T,
				verticalMerge: e.verticalMerge,
				vAlign: e.vAlign,
				...e.background ? { background: e.background } : {},
				blocks: N
			};
		}), y = {
			xPt: p,
			yPt: a,
			widthPt: c,
			heightPt: l
		}, b = mf([y, ...v.map((e) => e.inkBounds)]) ?? y;
		return {
			kind: "table-row",
			id: e.id,
			source: e.source,
			flowDomainId: r.flowDomainId,
			ordinaryFlow: r.ordinaryFlow,
			flowBounds: y,
			inkBounds: b,
			advancePt: l,
			heightPt: l,
			contentHeightPt: o.contentHeights[n] ?? 0,
			...e.repeatedHeader ? { repeatedHeader: !0 } : {},
			cells: v
		};
	}), v = d.length > 0 ? Math.min(...d) : f, y = d.length > 0 ? Math.max(...d.map((e) => e + c)) : f + c, b = {
		xPt: v,
		yPt: u,
		widthPt: Math.max(0, y - v),
		heightPt: l
	}, x = mf([b, ..._.map((e) => e.inkBounds)]) ?? b;
	return H({
		layout: {
			kind: "table",
			id: r.id,
			source: r.source,
			flowDomainId: r.flowDomainId,
			ordinaryFlow: r.ordinaryFlow,
			flowBounds: b,
			inkBounds: Px(x, p),
			advancePt: l,
			columnWidthsPt: r.columnWidthsPt,
			rows: _,
			borders: p
		},
		nextCursor: {
			xPt: t.cursor.xPt,
			yPt: t.cursor.yPt + l
		}
	}, "TableLayoutResult");
}
//#endregion
//#region packages/docx/src/layout/table-acquisition.ts
function Rx(e, t) {
	let n = e.findIndex((e, n) => n > t && e.type === "paragraph" && e.framePr == null);
	if (n < 0) throw Error("A nested floating table requires a following regular paragraph anchor");
	return n;
}
function zx(e) {
	if (!e) return null;
	let t = e.color ?? "000000";
	return Object.freeze({
		widthPt: e.width,
		color: t.startsWith("#") ? t : `#${t}`,
		authoredStyle: e.style
	});
}
function Bx(e) {
	return Object.freeze({
		top: zx(e.top),
		right: zx(e.right),
		bottom: zx(e.bottom),
		left: zx(e.left),
		insideH: zx(e.insideH),
		insideV: zx(e.insideV)
	});
}
function Vx(e, t) {
	if (e === "center") return "center";
	let n = e === "right" || e === "end";
	return (t ? !n : n) ? "right" : "left";
}
function Hx(e) {
	return e.lines.some((e) => e.placements.some((e) => e.kind === "text" && e.dependency === "page"));
}
function Ux(e, t, n, r, i, a) {
	let o = Array.isArray(i) ? {
		story: "body",
		storyInstance: "body",
		path: i
	} : i, s = o.path, c = (e) => ({
		story: o.story,
		storyInstance: o.storyInstance,
		path: e
	}), l = a.layoutServices(r);
	if (!l) throw Error("Retained table acquisition requires layout services");
	let u = o.story === "body" && o.storyInstance === "body" ? `table:${s.join(".")}` : `${o.story}:${o.storyInstance}:table:${s.join(".")}`, d = a.tableFormat(e), f = e.bidiVisual === !0, p = d.firstRowException, m = p?.indentAuthored ? p.indentPt ?? 0 : e.tblInd ?? 0, h = {}, g = [], _ = e.rows.map((n, i) => {
		let o = d.rows[i], l = Math.max(0, Math.min(t.length, n.gridBefore ?? 0)), p = n.cells.map((n, d) => {
			let f = o?.cells[d]?.marginsPt ?? {
				top: n.marginTop ?? e.cellMarginTop,
				right: n.marginRight ?? e.cellMarginRight,
				bottom: n.marginBottom ?? e.cellMarginBottom,
				left: n.marginLeft ?? e.cellMarginLeft
			}, p = l, m = Math.min(Math.max(1, n.colSpan), Math.max(0, t.length - p));
			l += m;
			let _ = t.slice(p, p + m).reduce((e, t) => e + t, 0), v = rr(o?.cellSpacingPt ?? 0, p, m, t.length), y = [
				...s,
				i,
				d
			], b = `${u}:cell:${i}.${d}`, x = n.vMerge === !1 ? [] : ox({
				cell: n,
				table: e,
				cellTotalWidthPt: _,
				outerState: r,
				sourcePath: y
			}, {
				resolveContentWidthPt: (e, t, n) => Math.max(0, n - v.startPt - v.endPt - f.left - f.right),
				createCellState: a.createCellState,
				acquireParagraph: (e, t, n, r, o) => a.acquireParagraph(e, t, n, r, `${u}:cell:${i}.${d}`, o, void 0, c(r)),
				acquireNestedTable: (e, t, r, i) => {
					let o = Ux(t, a.resolveColumns(t, r, e), r, e, c(i), a);
					h[o.layout.id] = o;
					let s = a.tableFormat(t).positioning;
					if (s) {
						let r = i[i.length - 1], c = s, l = t.overlap === "never" ? "never" : "overlap", u = a.registerFloatingTable(e, {
							child: o.layout,
							positioning: c,
							overlap: l
						}), d = {
							hostCellId: b,
							sourceBlockIndex: r,
							anchorBlockIndex: Rx(n.content, r),
							tableId: o.layout.id,
							overlap: l,
							positioning: c,
							...u == null ? {} : { acquiredTextOffsetPt: Object.freeze({ ...u }) }
						};
						g.push(d);
					}
					return o.layout;
				},
				advanceState: a.advanceState
			});
			return {
				id: b,
				source: c(y),
				columnStart: p,
				columnSpan: m,
				verticalMerge: n.vMerge === !0 ? "restart" : n.vMerge === !1 ? "continue" : "none",
				margins: {
					topPt: f.top,
					rightPt: f.right,
					bottomPt: f.bottom,
					leftPt: f.left
				},
				vAlign: n.vAlign,
				...n.background ? { background: { color: n.background.startsWith("#") ? n.background : `#${n.background}` } } : {},
				borders: Bx(n.borders),
				blocks: x.flatMap((e, t) => {
					let r = n.content[t];
					return r?.type === "table" && a.tableFormat(r).ordinaryFlow === !1 ? [] : [{
						layout: e,
						sourceBlockIndex: t,
						...e.kind === "paragraph" && Hx(e) ? { pageDependent: !0 } : {},
						...ax(n.content, t) ? { structuralTrailing: !0 } : {}
					}];
				})
			};
		}), _ = o?.height?.rule ?? "auto";
		return {
			id: `${u}:row:${i}`,
			source: c([...s, i]),
			logicalRowIndex: i,
			cantSplit: o?.cantSplit ?? n.cantSplit === !0,
			heightPt: o?.height?.valuePt ?? null,
			heightRule: _,
			cellSpacingPt: o?.cellSpacingPt ?? 0,
			exceptionBorders: o?.exception?.borders ? Bx(o.exception.borders) : null,
			alignment: Vx(o?.justification ?? e.jc, f),
			indentPt: m,
			cells: p,
			repeatedHeader: o?.repeatedHeader ?? n.isHeader === !0
		};
	}), v = H({
		kind: "table",
		id: u,
		source: c([...s]),
		flowDomainId: u,
		ordinaryFlow: d.ordinaryFlow,
		alignment: Vx(e.jc, f),
		indentPt: m,
		bidiVisual: f,
		columnWidthsPt: t,
		borders: Bx(e.borders),
		rows: _
	}, "RetainedTableAcquisition.input"), y = {
		xPt: 0,
		yPt: 0,
		widthPt: n,
		heightPt: 1
	}, b = Lx(v, {
		container: {
			id: u,
			kind: "tableCell",
			bounds: y
		},
		cursor: {
			xPt: 0,
			yPt: 0
		},
		availableBounds: y
	}, l).layout;
	return Object.freeze({
		input: v,
		layout: b,
		nestedById: Object.freeze(h),
		floatingTables: H(g, "RetainedTableAcquisition.floatingTables")
	});
}
//#endregion
//#region packages/docx/src/layout/adjacent-table-layout-input.ts
function Wx(e, t, n) {
	return t === n ? e : Object.freeze({
		...e,
		left: e.right,
		right: e.left
	});
}
function Gx(e, t, n) {
	let r = Wx(e.borders, e.bidiVisual, n), i = t.exceptionBorders == null ? null : Wx(t.exceptionBorders, e.bidiVisual, n);
	return i ? Object.freeze({
		top: fx(i.top, r.top),
		right: fx(i.right, r.right),
		bottom: fx(i.bottom, r.bottom),
		left: fx(i.left, r.left),
		insideH: fx(i.insideH, r.insideH),
		insideV: fx(i.insideV, r.insideV)
	}) : r;
}
var Kx = class {
	nodes = [Object.freeze({ kind: "zero" })];
	interned = new Map([["Z", 0]]);
	intern(e, t) {
		let n = this.interned.get(e);
		if (n !== void 0) return n;
		let r = this.nodes.length;
		return this.nodes.push(Object.freeze(t)), this.interned.set(e, r), r;
	}
	token(e, t) {
		return this.intern(`T:${e}:${t}`, { kind: "token" });
	}
	add(e, t) {
		if (e === 0) return t;
		if (t === 0) return e;
		let n = this.nodes[e], r = this.nodes[t];
		return n.kind === "sub" && n.right === t ? n.left : r.kind === "sub" && r.right === e ? r.left : this.intern(`A:${e}:${t}`, {
			kind: "add",
			left: e,
			right: t
		});
	}
	subtract(e, t) {
		if (e === t) return 0;
		if (t === 0) return e;
		let n = this.nodes[t];
		return n.kind === "sub" && n.left === e ? n.right : this.intern(`S:${e}:${t}`, {
			kind: "sub",
			left: e,
			right: t
		});
	}
	divide(e, t) {
		return e === 0 ? 0 : this.intern(`D:${e}:${t}`, {
			kind: "div",
			value: e,
			divisor: t
		});
	}
};
function qx(e, t = 0) {
	return Object.freeze({
		position: e,
		sym: t,
		identity: `${e}|${t}`
	});
}
function Jx(e, t, n) {
	return qx(Qn(t.position, n.position), e.add(t.sym, n.sym));
}
function Yx(e, t, n) {
	return qx(er(t.position, n.position), e.subtract(t.sym, n.sym));
}
function Xx(e, t, n) {
	return qx(tr(t.position, n), e.divide(t.sym, n));
}
function Zx(e, t, n) {
	let r = [qx("0/1")];
	return t.columnWidthsPt.forEach((i, a) => {
		let o = t.columnWidthKeys?.[a], s = Jn(i) ?? "0/1", c = o === null ? qx(s, e.token(n, a)) : qx(o ?? s);
		r.push(Jx(e, r.at(-1), c));
	}), Object.freeze(r);
}
function Qx(e, t, n, r) {
	let i = Yx(e, r, n);
	return t.alignment === "right" ? i : t.alignment === "center" ? Xx(e, i, 2n) : qx("0/1");
}
function $x(e, t, n, r, i) {
	return Jx(e, i, r ? Yx(e, n, t) : t);
}
function eS(e, t) {
	if (e.length === 0) throw RangeError("Adjacent table group id must not be empty");
	if (t.length === 0) throw RangeError("Adjacent table group requires at least one table");
	if (t.some((e) => !e.ordinaryFlow)) throw Error("An absolutely positioned table cannot join an adjacent table group");
	let n = t[0], r = n.bidiVisual, i = new Kx(), a = qx("0/1"), o = t.map((e, t) => Zx(i, e, t)), s = o.map((e) => e.at(-1) ?? a), c = s.reduce((e, t) => nr(t.position, e.position) > 0 ? t : e, a), l = (e, t, n, a) => {
		let o = $x(i, e, t, n, a);
		return r ? Yx(i, c, o) : o;
	}, u = [];
	t.forEach((e, t) => {
		let n = o[t], a = s[t], d = e.bidiVisual !== r;
		e.rows.forEach((t) => {
			let r = Qx(i, t, a, c), o = n.map((t) => l(t, a, e.bidiVisual, r));
			u.push({
				input: e,
				row: t,
				groupBoundaries: o,
				descending: d
			});
		});
	});
	let d = /* @__PURE__ */ new Map();
	for (let e of [a, c]) d.set(e.identity, {
		boundary: e,
		count: 1
	});
	for (let e of u) {
		let t = /* @__PURE__ */ new Map();
		for (let n of e.groupBoundaries) {
			let e = t.get(n.identity);
			t.set(n.identity, {
				boundary: n,
				count: (e?.count ?? 0) + 1
			});
		}
		for (let [e, n] of t) {
			let t = d.get(e);
			n.count > (t?.count ?? 0) && d.set(e, n);
		}
	}
	let f = /* @__PURE__ */ new Map(), p = (e) => {
		let t = f.get(e);
		return t || (t = {
			position: e,
			identities: /* @__PURE__ */ new Map(),
			edges: /* @__PURE__ */ new Map(),
			firstSeen: /* @__PURE__ */ new Map()
		}, f.set(e, t)), t;
	};
	for (let [e, t] of d) p(t.boundary.position).identities.set(e, t);
	let m = 0;
	for (let e of u) {
		let t = e.descending ? [...e.groupBoundaries].reverse() : e.groupBoundaries, n = null, r = null;
		for (let e of t) {
			let t = p(e.position);
			if (t.firstSeen.has(e.identity) || t.firstSeen.set(e.identity, m++), n !== e.position && (n = e.position, r = null), r !== null && r !== e.identity) {
				let n = t.edges.get(r);
				n || (n = /* @__PURE__ */ new Set(), t.edges.set(r, n)), n.add(e.identity);
			}
			r = e.identity;
		}
	}
	for (let e of f.values()) for (let t of e.identities.keys()) e.firstSeen.has(t) || e.firstSeen.set(t, m++);
	let h = [...f.values()].sort((e, t) => nr(e.position, t.position)), g = [], _ = /* @__PURE__ */ new Map();
	for (let e of h) {
		let t = new Map([...e.identities.keys()].map((e) => [e, 0]));
		for (let n of e.edges.values()) for (let e of n) t.set(e, (t.get(e) ?? 0) + 1);
		let n = [], r = (t) => {
			n.push(t);
			let r = n.length - 1;
			for (; r > 0;) {
				let t = Math.floor((r - 1) / 2);
				if (e.firstSeen.get(n[t]) <= e.firstSeen.get(n[r])) break;
				[n[t], n[r]] = [n[r], n[t]], r = t;
			}
		}, i = () => {
			let t = n[0], r = n.pop();
			if (n.length > 0) {
				n[0] = r;
				let t = 0;
				for (;;) {
					let r = t * 2 + 1, i = r + 1;
					if (r >= n.length) break;
					let a = r;
					if (i < n.length && e.firstSeen.get(n[i]) < e.firstSeen.get(n[r]) && (a = i), e.firstSeen.get(n[t]) <= e.firstSeen.get(n[a])) break;
					[n[t], n[a]] = [n[a], n[t]], t = a;
				}
			}
			return t;
		};
		for (let n of e.identities.keys()) t.get(n) === 0 && r(n);
		let a = [];
		for (; n.length > 0;) {
			let n = i();
			a.push(n);
			for (let i of e.edges.get(n) ?? []) {
				let e = t.get(i) - 1;
				t.set(i, e), e === 0 && r(i);
			}
		}
		if (a.length !== e.identities.size) throw Error(`Adjacent table symbolic boundary ordering cycle at ${e.position}`);
		for (let t of a) {
			let { boundary: n, count: r } = e.identities.get(t);
			_.set(t, g.length);
			for (let e = 0; e < r; e += 1) g.push(n);
		}
	}
	let v = g.slice(1).map((e, t) => {
		let n = g[t];
		return e.sym === n.sym ? er(e.position, n.position) : null;
	}), y = g.slice(1).map((e, t) => Zn(er(e.position, g[t].position))), b = (e, t) => {
		let n = /* @__PURE__ */ new Map(), r = Array(e.length);
		return e.forEach((e, i) => {
			let a = n.get(e.identity) ?? 0;
			n.set(e.identity, a + 1);
			let o = _.get(e.identity), s = d.get(e.identity).count;
			r[i] = t ? o + (s - 1 - a) : o + a;
		}), r;
	}, x = 0, S = u.map((e) => {
		let { input: t, row: n, groupBoundaries: i, descending: a } = e, o = b(i, a), s = o[0], c = o[i.length - 1], l = n.cells.map((e) => {
			let n = o[e.columnStart], i = o[e.columnStart + e.columnSpan];
			if (n == null || i == null) throw RangeError(`Table cell ${e.id} exceeds its authored grid`);
			let a = Math.min(n, i), s = Math.max(n, i);
			if (s <= a) throw Error(`Table cell ${e.id} cannot be mapped into the logical group grid`);
			let c = Wx(e.borders, t.bidiVisual, r);
			return Object.freeze({
				...e,
				columnStart: a,
				columnSpan: s - a,
				borders: c
			});
		});
		return Object.freeze({
			...n,
			logicalRowIndex: x++,
			exceptionBorders: null,
			sourceTableEdges: Gx(t, n, r),
			indentPt: t.bidiVisual === r ? n.indentPt : -n.indentPt,
			sourceOuterColumnStart: Math.min(s, c),
			sourceOuterColumnEnd: Math.max(s, c),
			cells: Object.freeze(l)
		});
	});
	return i.nodes.length, Object.freeze({
		kind: "adjacent-table-group-grid",
		id: e,
		source: n.source,
		flowDomainId: `${n.flowDomainId}:adjacent-group:${e}`,
		alignment: n.alignment,
		indentPt: n.indentPt,
		bidiVisual: r,
		columnWidthsPt: Object.freeze(y),
		columnWidthKeys: Object.freeze(v),
		rows: Object.freeze(S)
	});
}
//#endregion
//#region packages/docx/src/layout/table-pagination.ts
var tS = 1e-4;
function nS() {
	return Object.freeze({
		blockIndex: 0,
		paragraphLineStart: 0,
		nestedCursor: null,
		nestedFragmentIndex: 0
	});
}
function rS() {
	return Object.freeze({
		rowIndex: 0,
		rowFragmentIndex: 0,
		cells: Object.freeze([])
	});
}
function iS(e) {
	let t = 0;
	for (; e.rows[t]?.repeatedHeader === !0;) t += 1;
	return t;
}
function aS(e, t) {
	let n = e.layout.rows[t];
	return n ? e.input.rows[t]?.heightRule === "exact" ? Math.max(0, n.heightPt) : Math.max(0, n.heightPt, n.contentHeightPt) : 0;
}
function oS(e, t, n, r) {
	if (t === e.input.rows[n]) return aS(e, n);
	let i = Lx({
		...e.input,
		id: `${e.input.id}:row-occurrence:${r.page.occurrenceId}:${t.logicalRowIndex}`,
		rows: [t]
	}, r.placement, r.services).layout;
	return Math.max(0, i.rows[0]?.heightPt ?? i.advancePt);
}
function sS(e, t, n, r) {
	return t === e.input.rows[n] ? Math.max(0, e.layout.rows[n]?.heightPt ?? 0) : oS(e, t, n, r);
}
function cS(e, t, n, r) {
	let i = Lx({
		...e.input,
		id: `${e.input.id}:completed-partial:${r.page.occurrenceId}:${t.logicalRowIndex}`,
		rows: [t, ...e.input.rows.slice(n + 1)]
	}, r.placement, r.services).layout;
	return Math.max(0, i.rows[0]?.heightPt ?? 0);
}
function lS(e) {
	return e.cells.map((e) => e.blocks.map((e) => ({
		kind: "whole",
		blockIndex: e.sourceBlockIndex
	})));
}
function uS(e, t, n, r) {
	let i = r.reacquirePageDependentBlock;
	return !i || !t.cells.some((e) => e.blocks.some((e) => e.pageDependent === !0)) ? t : {
		...t,
		cells: t.cells.map((e, a) => ({
			...e,
			blocks: e.blocks.map((e) => e.pageDependent === !0 ? {
				...e,
				layout: i({
					logicalRowIndex: t.logicalRowIndex,
					logicalCellIndex: a,
					sourceBlockIndex: e.sourceBlockIndex,
					ownership: n,
					page: r.page,
					acquired: e.layout
				})
			} : e)
		}))
	};
}
function dS(e) {
	let t = e.positioning.horzSpecified && (e.positioning.horzAnchor === "page" || e.positioning.horzAnchor === "margin"), n = e.positioning.vertAnchor === "page" || e.positioning.vertAnchor === "margin";
	return t || n;
}
function fS(e, t, n, r, i) {
	return {
		...t,
		heightPt: null,
		heightRule: "auto",
		cells: t.cells.map((t, a) => {
			let o = n.cells[a] ?? nS();
			return {
				...t,
				blocks: t.blocks.slice(o.blockIndex).map((n, a) => {
					if (a === 0 && o.nestedCursor && n.layout.kind === "table") {
						let a = e.nestedById[n.layout.id];
						if (a) {
							let e = wS(a, o.nestedCursor, {
								...r,
								availableHeightPt: r.freshPageHeightPt,
								placement: {
									...r.placement,
									availableBounds: {
										...r.placement.availableBounds,
										heightPt: r.freshPageHeightPt
									}
								}
							}), s = i.get(t.id);
							if (e.nextCursor && s !== void 0 && n.sourceBlockIndex < s) throw Error("Floating table anchor cannot follow an incomplete nested-table candidate");
							if (e.fragment) return {
								...n,
								layout: e.fragment
							};
						}
					}
					return a !== 0 || o.paragraphLineStart === 0 || n.layout.kind !== "paragraph" ? n : {
						...n,
						layout: yS(n.layout, o.paragraphLineStart, n.layout.lines.length)
					};
				})
			};
		})
	};
}
function pS(e, t, n, r, i, a, o, s, c) {
	let l = i.floatingTableFrames, u = i.reacquirePageDependentBlock, d = e.input.rows[t.logicalRowIndex];
	if (!l || !u || !d) return {
		row: t,
		resolved: [],
		registry: a,
		nextParagraphId: o
	};
	let f = e.floatingTables.filter((e) => d.cells.some((t) => t.id === e.hostCellId) && c(e));
	if (f.length === 0) return {
		row: t,
		resolved: [],
		registry: a,
		nextParagraphId: o
	};
	let p = /* @__PURE__ */ new Map();
	for (let e of f) p.set(e.hostCellId, Math.min(p.get(e.hostCellId) ?? Infinity, e.anchorBlockIndex));
	let m = {
		...i.placement,
		cursor: {
			...i.placement.cursor,
			yPt: i.placement.cursor.yPt + r
		}
	}, h = fS(e, t, s, i, p), g = Lx({
		...e.input,
		id: `${e.input.id}:float-probe:${i.page.occurrenceId}:${t.logicalRowIndex}`,
		rows: [h]
	}, m, i.services).layout, _ = i.finalPlacementTranslationPt ?? {
		xPt: 0,
		yPt: 0
	}, v = (t, r, a) => {
		let o = a.cells.findIndex((e) => e.id === t.hostCellId), s = r.rows[0]?.cells[o], c = a.cells[o]?.blocks.findIndex((e) => e.sourceBlockIndex === t.anchorBlockIndex) ?? -1, l = c < 0 ? void 0 : s?.blocks[c], u = e.nestedById[t.tableId]?.layout;
		return !s || !l || !u ? null : Object.freeze({
			kind: "floating-table-placement",
			occurrenceId: [
				i.page.occurrenceId,
				t.hostCellId,
				t.sourceBlockIndex,
				t.tableId
			].join(":"),
			ownership: n,
			physicalPageIndex: i.page.physicalPageIndex,
			displayPageNumber: i.page.displayPageNumber,
			...t,
			columnBounds: Object.freeze({
				xPt: s.contentBounds.xPt + _.xPt,
				yPt: s.contentBounds.yPt + _.yPt,
				widthPt: s.contentBounds.widthPt,
				heightPt: s.contentBounds.heightPt
			}),
			anchorBounds: Object.freeze({
				xPt: s.contentBounds.xPt + _.xPt,
				yPt: s.flowBounds.yPt + l.offsetPt + _.yPt,
				widthPt: l.layout.flowBounds.widthPt,
				heightPt: l.layout.flowBounds.heightPt
			}),
			child: u
		});
	}, y = (n) => {
		let r = fS(e, n, s, i, p), c = n === t ? g : Lx({
			...e.input,
			id: `${e.input.id}:float-converge:${i.page.occurrenceId}:${t.logicalRowIndex}`,
			rows: [r]
		}, m, i.services).layout, u = Rb(a, o, i.floatingTableRegistry?.coordinateSpace ?? "logical-page-points", i.floatingTableRegistry?.flowDomainId ?? e.input.flowDomainId), d = [];
		for (let e of f) {
			let t = v(e, c, r);
			if (!t || i.floatingTableRegistry?.coordinateSpace !== "upright-physical-page-points" && !dS(t)) continue;
			let n = zb(t, {
				page: l.page,
				margin: l.margin,
				text: {
					xPt: t.columnBounds?.xPt ?? t.anchorBounds.xPt,
					yPt: t.anchorBounds.yPt,
					widthPt: t.columnBounds?.widthPt ?? t.anchorBounds.widthPt,
					heightPt: t.anchorBounds.heightPt
				}
			}, u);
			d.push(n.placement), u = n.transaction;
		}
		return {
			resolved: Object.freeze(d),
			transaction: u
		};
	}, b = (e) => ({
		...t,
		cells: t.cells.map((r, a) => ({
			...r,
			blocks: r.blocks.map((o) => {
				let s = e.filter((e) => e.source.hostCellId === r.id && e.source.anchorBlockIndex === o.sourceBlockIndex).map((e) => Object.freeze({
					xPt: e.exclusionBounds.xPt - e.source.anchorBounds.xPt,
					yPt: e.exclusionBounds.yPt - e.source.anchorBounds.yPt,
					widthPt: e.exclusionBounds.widthPt,
					heightPt: e.exclusionBounds.heightPt
				}));
				return s.length === 0 || o.layout.kind !== "paragraph" ? o : {
					...o,
					layout: u({
						logicalRowIndex: t.logicalRowIndex,
						logicalCellIndex: a,
						sourceBlockIndex: o.sourceBlockIndex,
						ownership: n,
						page: i.page,
						acquired: o.layout,
						floatingTableExclusions: Object.freeze(s)
					})
				};
			})
		}))
	}), x = (e, t) => JSON.stringify({
		blocks: e.cells.map((e) => e.blocks.map((e) => ({
			sourceBlockIndex: e.sourceBlockIndex,
			layout: e.layout
		}))),
		placements: t
	}), S = y(t);
	if (S.resolved.length === 0) return {
		row: t,
		resolved: [],
		registry: a,
		nextParagraphId: o
	};
	try {
		let e = Ma({
			seedState: x(t, S.resolved),
			step: (e) => {
				let t = b(e?.resolution.resolved ?? S.resolved), n = y(t);
				return Object.freeze({
					candidate: t,
					resolution: n,
					state: x(t, n.resolved)
				});
			},
			stateOf: (e) => e.state,
			limit: 16
		}).value;
		return {
			row: e.candidate,
			resolved: e.resolution.resolved,
			registry: Object.freeze([...e.resolution.transaction.base, ...e.resolution.transaction.delta]),
			nextParagraphId: e.resolution.transaction.nextParagraphId
		};
	} catch (e) {
		throw e instanceof ja ? new J("NON_CONVERGENCE", `floating table final-frame reflow did not converge (${e.reason}; ${e.states.length} states)`) : e;
	}
}
function mS(e, t, n) {
	let r = e.input.rows[t.logicalRowIndex]?.cells.findIndex((e) => e.id === n.hostCellId) ?? -1;
	return r >= 0 && (t.ranges[r]?.some((e) => e.blockIndex === n.anchorBlockIndex && (e.kind === "whole" || e.kind === "paragraph" && e.lineStart === 0 || e.kind === "nested-table" && e.childFragmentIndex === 0)) ?? !1);
}
function hS(e) {
	return `${e.hostCellId}:${e.sourceBlockIndex}:${e.tableId}`;
}
function gS(e, t) {
	return new Set(e.floatingTables.filter((n) => mS(e, t, n)).map(hS));
}
function _S(e, t) {
	return e.size === t.size && [...e].every((e) => t.has(e));
}
function vS(e, t, n = 0, r = !1, i = []) {
	return {
		input: e,
		logicalRowIndex: e.logicalRowIndex,
		fragmentIndex: n,
		ownership: t,
		ranges: lS(e),
		...r ? { clipAtPageEnd: !0 } : {},
		...i.length ? { resolvedFloatingTables: i } : {}
	};
}
function yS(e, t, n) {
	return ey(e, {
		lineStart: t,
		lineEnd: n,
		continuesFromPrevious: t > 0,
		continuesOnNext: n < e.lines.length
	});
}
function bS(e, t, n, r, i) {
	let a = null, o = n;
	for (let s = n + 1; s <= e.lines.length; s += 1) {
		let c = yS(e, n, s), l = {
			layout: c,
			sourceBlockIndex: t
		};
		if (gx([...r, l]) > i + tS) break;
		a = c, o = s;
	}
	return a ? {
		block: {
			layout: a,
			sourceBlockIndex: t
		},
		range: {
			kind: "paragraph",
			blockIndex: t,
			lineStart: n,
			lineEnd: o
		},
		lineEnd: o,
		advancePt: a.advancePt
	} : {
		block: null,
		range: null,
		lineEnd: n,
		advancePt: 0
	};
}
function xS(e, t, n, r, i) {
	if (t.verticalMerge === "continue") return {
		input: t,
		range: [],
		next: n,
		complete: !0
	};
	let a = [], o = [], s = n.blockIndex, c = n.paragraphLineStart, l = n.nestedCursor, u = n.nestedFragmentIndex;
	for (; s < t.blocks.length;) {
		let n = t.blocks[s], d = n.layout;
		if (d.kind === "paragraph") {
			if (n.structuralTrailing) {
				a.push(n), o.push({
					kind: "whole",
					blockIndex: n.sourceBlockIndex
				}), s += 1, c = 0;
				continue;
			}
			if (d.lines.length === 0) {
				if (gx([...a, n]) > r + tS) break;
				a.push(n), o.push({
					kind: "whole",
					blockIndex: n.sourceBlockIndex
				}), s += 1, c = 0;
				continue;
			}
			let e = bS(d, n.sourceBlockIndex, c, a, r);
			if (!e.block || !e.range) break;
			if (a.push({
				...e.block,
				...n.structuralTrailing ? { structuralTrailing: !0 } : {}
			}), o.push(e.range), e.lineEnd < d.lines.length) {
				c = e.lineEnd;
				break;
			}
			s += 1, c = 0;
			continue;
		}
		let f = e.nestedById[d.id];
		if (f) {
			let e = Math.max(0, r - gx(a)), t = wS(f, l ?? rS(), {
				...i,
				availableHeightPt: e,
				placement: {
					...i.placement,
					availableBounds: {
						...i.placement.availableBounds,
						heightPt: e
					}
				}
			});
			if (!t.fragment) break;
			if (a.push({
				layout: t.fragment,
				sourceBlockIndex: n.sourceBlockIndex
			}), o.push({
				kind: "nested-table",
				blockIndex: n.sourceBlockIndex,
				childFragmentIndex: u
			}), t.nextCursor) {
				l = t.nextCursor, u += 1;
				break;
			}
			s += 1, l = null, u = 0;
			continue;
		}
		if (gx([...a, n]) > r + tS) break;
		a.push(n), o.push({
			kind: "whole",
			blockIndex: n.sourceBlockIndex
		}), s += 1;
	}
	let d = s >= t.blocks.length;
	return {
		input: {
			...t,
			blocks: a
		},
		range: o,
		next: Object.freeze({
			blockIndex: s,
			paragraphLineStart: c,
			nestedCursor: l,
			nestedFragmentIndex: u
		}),
		complete: d
	};
}
function SS(e, t, n, r, i) {
	let a = t.cells.map((e, t) => n.cells[t] ?? nS()), o = Math.max(0, ...t.cells.map((e) => e.margins.topPt + e.margins.bottomPt)), s = Math.max(0, t.cellSpacingPt) * 2, c = Math.max(0, r - o - s), l = t.cells.map((t, n) => xS(e, t, a[n], c, i));
	if (!l.some((e, t) => e.next.blockIndex !== a[t]?.blockIndex || e.next.paragraphLineStart !== a[t]?.paragraphLineStart || e.next.nestedFragmentIndex !== a[t]?.nestedFragmentIndex)) return {
		selected: null,
		next: n,
		complete: !1
	};
	let u = l.every((e) => e.complete);
	return u && n.rowFragmentIndex === 0 ? {
		selected: vS(t, "source"),
		next: Object.freeze({
			rowIndex: n.rowIndex + 1,
			rowFragmentIndex: 0,
			cells: Object.freeze([])
		}),
		complete: !0
	} : {
		selected: {
			input: {
				...t,
				id: `${t.id}:fragment:${n.rowFragmentIndex}`,
				heightPt: null,
				heightRule: "auto",
				cells: l.map((e, t) => ({
					...e.input,
					id: `${e.input.id}:fragment:${n.rowFragmentIndex}:${t}`
				}))
			},
			logicalRowIndex: t.logicalRowIndex,
			fragmentIndex: n.rowFragmentIndex,
			ownership: "source",
			ranges: l.map((e) => e.range)
		},
		next: Object.freeze({
			rowIndex: u ? n.rowIndex + 1 : n.rowIndex,
			rowFragmentIndex: u ? 0 : n.rowFragmentIndex + 1,
			cells: Object.freeze(u ? [] : l.map((e) => e.next))
		}),
		complete: u
	};
}
function CS(e, t, n) {
	let r = Lx({
		...e.input,
		id: `${e.input.id}:fragment:${n.page.occurrenceId}`,
		rows: t.map((e) => e.input)
	}, n.placement, n.services).layout, i = r.rows.map((e, r) => {
		let i = t[r];
		return Object.freeze({
			...e,
			logicalRowIndex: i.logicalRowIndex,
			fragmentIndex: i.fragmentIndex,
			ownership: i.ownership,
			occurrenceId: n.page.occurrenceId,
			physicalPageIndex: n.page.physicalPageIndex,
			displayPageNumber: n.page.displayPageNumber,
			cells: Object.freeze(e.cells.map((e, n) => {
				let a = i.input.cells[n]?.verticalMerge ?? "none", o = i.input.cells[n], s = a === "continue" && t.slice(0, r).some((e) => e.input.cells.some((e) => e.verticalMerge === "restart" && e.columnStart === o?.columnStart && e.columnSpan === o?.columnSpan));
				return Object.freeze({
					...e,
					contentRanges: Object.freeze([...i.ranges[n] ?? []]),
					...a === "continue" && !s ? { visualMergeOwnership: "continuation" } : {}
				});
			}))
		});
	}), a = t.flatMap((t, r) => {
		let a = e.input.rows[t.logicalRowIndex];
		return a ? e.floatingTables.flatMap((o) => {
			let s = a.cells.findIndex((e) => e.id === o.hostCellId);
			if (s < 0 || !(t.ranges[s]?.some((e) => e.blockIndex === o.anchorBlockIndex && (e.kind === "whole" || e.kind === "paragraph" && e.lineStart === 0)) ?? !1)) return [];
			let c = t.input.cells[s], l = i[r]?.cells[s], u = c?.blocks.findIndex((e) => e.sourceBlockIndex === o.anchorBlockIndex) ?? -1, d = u < 0 ? void 0 : l?.blocks[u], f = e.nestedById[o.tableId]?.layout;
			if (!l || !d || !f) throw Error("Floating table occurrence references missing retained layout data");
			let p = Object.freeze({
				xPt: l.contentBounds.xPt,
				yPt: l.flowBounds.yPt + d.offsetPt,
				widthPt: d.layout.flowBounds.widthPt,
				heightPt: d.layout.flowBounds.heightPt
			});
			return [Object.freeze({
				kind: "floating-table-placement",
				occurrenceId: [
					n.page.occurrenceId,
					o.hostCellId,
					o.sourceBlockIndex,
					o.tableId
				].join(":"),
				ownership: t.ownership,
				physicalPageIndex: n.page.physicalPageIndex,
				displayPageNumber: n.page.displayPageNumber,
				...o,
				anchorBounds: p,
				child: f
			})];
		}) : [];
	}), o = Object.freeze(t.flatMap((e) => e.resolvedFloatingTables ?? [])), s = new Set(o.map((e) => e.occurrenceId)), c = t.some((e) => e.clipAtPageEnd === !0), l = c ? Math.min(r.advancePt, n.availableHeightPt) : r.advancePt, u = c ? {
		...r.flowBounds,
		heightPt: l
	} : r.flowBounds;
	return Object.freeze({
		...r,
		flowBounds: u,
		...c ? {
			inkBounds: u,
			clipBounds: u,
			advancePt: l
		} : {},
		columnWidthsPt: e.layout.columnWidthsPt,
		rows: Object.freeze(i),
		floatingTables: Object.freeze(a.filter((e) => !s.has(e.occurrenceId))),
		resolvedFloatingTables: o,
		...n.floatingTableRegistry ? { resolvedFloatingTableCoordinateSpace: n.floatingTableRegistry.coordinateSpace } : {}
	});
}
function wS(e, t, n) {
	if (t.rowIndex >= e.input.rows.length) return {
		fragment: null,
		nextCursor: null,
		requiresFreshPage: !1
	};
	let r = [], i = n.floatingTableRegistry;
	if (i && i.flowDomainId.length === 0) throw Error("Floating table registry coordinate/domain mismatch");
	let a = Object.freeze([...i?.entries ?? []]), o = i?.nextParagraphId ?? 0, s = Math.max(0, n.availableHeightPt), c = iS(e.input);
	if (t.rowIndex >= c && t.rowIndex > 0 && c > 0) for (let i = 0; i < c; i += 1) {
		let c = pS(e, uS(e, e.input.rows[i], "repeated-header", n), "repeated-header", n.availableHeightPt - s, n, a, o, rS(), () => !0), l = c.row, u = oS(e, l, i, n);
		if (u > s + tS) return {
			fragment: null,
			nextCursor: t,
			requiresFreshPage: !0
		};
		r.push(vS(l, "repeated-header", 0, !1, c.resolved)), a = c.registry, o = c.nextParagraphId, s -= u;
	}
	let l = t, u = t.rowIndex, d = t.rowFragmentIndex === 0 && t.cells.length === 0 && e.layout.rows.slice(t.rowIndex).reduce((e, t) => e + Math.max(0, t.heightPt), 0) <= s + tS, f = !1;
	for (; u < e.input.rows.length;) {
		let i = "source", c = uS(e, e.input.rows[u], i, n), p = u === t.rowIndex ? t : Object.freeze({
			rowIndex: u,
			rowFragmentIndex: 0,
			cells: Object.freeze([])
		}), m = u !== t.rowIndex || t.rowFragmentIndex === 0, h = m ? pS(e, c, i, n.availableHeightPt - s, n, a, o, p, (e) => {
			let t = c.cells.findIndex((t) => t.id === e.hostCellId), n = c.cells[t]?.blocks.findIndex((t) => t.sourceBlockIndex === e.anchorBlockIndex) ?? -1;
			if (n < 0) return !1;
			let r = p.cells[t] ?? nS();
			return r.blockIndex < n || r.blockIndex === n && r.paragraphLineStart === 0;
		}) : {
			row: c,
			resolved: Object.freeze([]),
			registry: a,
			nextParagraphId: o
		}, g = h.row, _ = d || f ? sS(e, g, u, n) : oS(e, g, u, n);
		if (m && _ <= s + tS) {
			r.push(vS(g, "source", 0, !1, h.resolved)), a = h.registry, o = h.nextParagraphId, s -= _, u += 1, l = u < e.input.rows.length ? Object.freeze({
				rowIndex: u,
				rowFragmentIndex: 0,
				cells: Object.freeze([])
			}) : null;
			continue;
		}
		if (g.cantSplit) {
			if (r.some((e) => e.ownership === "source")) break;
			if (_ + (n.availableHeightPt - s) <= n.freshPageHeightPt + tS || n.availableHeightPt + tS < n.freshPageHeightPt) return {
				fragment: null,
				nextCursor: t,
				requiresFreshPage: !0
			};
			if (Zc({
				compatibility: n.compatibility,
				availableHeightPt: n.availableHeightPt,
				freshPageHeightPt: n.freshPageHeightPt,
				epsilonPt: tS
			})) {
				r.push(vS(g, "source", 0, !0, h.resolved)), a = h.registry, o = h.nextParagraphId, l = u + 1 < e.input.rows.length ? Object.freeze({
					rowIndex: u + 1,
					rowFragmentIndex: 0,
					cells: Object.freeze([])
				}) : null;
				break;
			}
		}
		if (n.oversizedRowPolicy === "atomic" && r.every((e) => e.ownership === "repeated-header") && n.availableHeightPt + tS >= n.freshPageHeightPt && _ > n.freshPageHeightPt + tS) {
			r.push(vS(g, "source", 0, !1, h.resolved)), a = h.registry, o = h.nextParagraphId, l = u + 1 < e.input.rows.length ? Object.freeze({
				rowIndex: u + 1,
				rowFragmentIndex: 0,
				cells: Object.freeze([])
			}) : null;
			break;
		}
		let v = SS(e, c, p, s, n), y = null, b = /* @__PURE__ */ new Set();
		for (; v.selected;) {
			let t = gS(e, v.selected), r = JSON.stringify([...t].sort());
			if (b.has(r)) throw Error("Floating table selected ownership did not converge");
			b.add(r), y = pS(e, c, i, n.availableHeightPt - s, n, a, o, p, (e) => t.has(hS(e)));
			let l = SS(e, y.row, p, s, n);
			if (!l.selected) {
				v = l;
				break;
			}
			let u = gS(e, l.selected);
			if (v = l, _S(t, u)) break;
			y = null;
		}
		if (v.selected && y === null) throw Error("Floating table selected ownership did not converge");
		if (v.selected) {
			let t = y?.resolved ?? [];
			if (t.some((t) => !mS(e, v.selected, t.source))) throw Error("Floating table transaction included an unowned occurrence");
			let i = a.length, c = (y?.registry ?? a).slice(i);
			if (r.push({
				...v.selected,
				...t.length ? { resolvedFloatingTables: Object.freeze(t) } : {}
			}), a = Object.freeze([...a, ...c]), o += c.length, l = v.next.rowIndex >= e.input.rows.length ? null : v.next, v.complete && v.next.rowIndex < e.input.rows.length) {
				s = Math.max(0, s - cS(e, v.selected.input, u, n)), f = !0, u = v.next.rowIndex;
				continue;
			}
		}
		break;
	}
	if (r.filter((e) => e.ownership === "source").length === 0) {
		if (!(n.availableHeightPt + tS < n.freshPageHeightPt)) throw new J("NON_CONVERGENCE", "Table pagination cannot advance from a fresh page");
		return {
			fragment: null,
			nextCursor: t,
			requiresFreshPage: !0
		};
	}
	let p = CS(e, r, n);
	for (; p.advancePt > n.availableHeightPt + tS;) {
		let t = r.at(-1), i = r.filter((e) => e.ownership === "source").length;
		if (!(t?.ownership === "source" && t.fragmentIndex === 0 && t.ranges.every((e) => e.every((e) => e.kind === "whole"))) || i <= 1) break;
		r.pop(), l = Object.freeze({
			rowIndex: t.logicalRowIndex,
			rowFragmentIndex: 0,
			cells: Object.freeze([])
		}), p = CS(e, r, n);
	}
	return p.advancePt > n.availableHeightPt + tS && n.availableHeightPt + tS < n.freshPageHeightPt && p.advancePt <= n.freshPageHeightPt + tS ? {
		fragment: null,
		nextCursor: t,
		requiresFreshPage: !0
	} : {
		fragment: p,
		nextCursor: l,
		requiresFreshPage: !1,
		floatingTablePlacements: p.resolvedFloatingTables,
		...i ? { floatingTableRegistryDelta: (() => {
			let e = a.slice(i.entries.length).filter((e) => p.resolvedFloatingTables.some((t) => t.occurrenceId === e.occurrenceId));
			return Ib(i, e, i.nextParagraphId + e.length);
		})() } : {}
	};
}
//#endregion
//#region packages/docx/src/layout/registered-paragraph-acquisition.ts
function TS(e, t, n, r) {
	let i = l_(e, n.flowDomainId), a = Bv(t, {
		...n,
		exclusions: Object.freeze([
			...n.exclusions,
			...i.exclusions,
			...r?.exclusions ?? []
		]),
		anchorCollisions: Object.freeze([
			...n.anchorCollisions ?? [],
			...i.collisions,
			...r?.collisions ?? []
		])
	});
	return u_(e, i, a.layout), a;
}
//#endregion
//#region packages/docx/src/layout/paragraph-float-authority.ts
function ES(e, t) {
	return e.flatMap((e, n) => e.kind === "shape" && e.anchorOccurrenceId && e.authoredWrap === void 0 ? [] : [{
		id: e.imageKey || `${t}:float:${n}`,
		wrap: e.authoredWrap ?? (e.mode === "topAndBottom" ? "topAndBottom" : "square"),
		wrapSide: Xi(e.side),
		bounds: {
			xPt: e.xLeft,
			yPt: e.yTop,
			widthPt: Math.max(0, e.xRight - e.xLeft),
			heightPt: Math.max(0, e.yBottom - e.yTop)
		},
		polygon: e.wrapPolygon ?? [
			{
				xPt: e.xLeft,
				yPt: e.yTop
			},
			{
				xPt: e.xRight,
				yPt: e.yTop
			},
			{
				xPt: e.xRight,
				yPt: e.yBottom
			},
			{
				xPt: e.xLeft,
				yPt: e.yBottom
			}
		],
		...e.kind === "table" && !e.anchorOccurrenceId ? { verticalOwnership: "page" } : {},
		...e.anchorOccurrenceId ? {
			anchorOccurrenceId: e.anchorOccurrenceId,
			verticalOwnership: "page"
		} : {}
	}]);
}
function DS(e) {
	return e.flatMap((e) => e.kind !== "shape" || !e.anchorOccurrenceId ? [] : [{
		occurrenceId: e.anchorOccurrenceId,
		bounds: {
			xPt: e.imageX,
			yPt: e.imageY,
			widthPt: e.imageW,
			heightPt: e.imageH
		},
		horizontalOwnership: "page",
		verticalOwnership: "page"
	}]);
}
//#endregion
//#region packages/docx/src/layout/drawingml-collision-registry.ts
function OS(e) {
	if (e.occurrenceId.length === 0) throw Error("DrawingML collision occurrence ID must not be empty");
	let { xPt: t, yPt: n, widthPt: r, heightPt: i } = e.bounds;
	if (![
		t,
		n,
		r,
		i
	].every(Number.isFinite) || r < 0 || i < 0) throw Error(`DrawingML collision bounds are invalid: ${e.occurrenceId}`);
	if (e.horizontalOwnership !== "page" && e.horizontalOwnership !== "host" || e.verticalOwnership !== "page" && e.verticalOwnership !== "host") throw Error(`DrawingML collision ownership is invalid: ${e.occurrenceId}`);
}
function kS(e) {
	return OS(e), Object.freeze({
		occurrenceId: e.occurrenceId,
		bounds: Object.freeze({ ...e.bounds }),
		horizontalOwnership: e.horizontalOwnership,
		verticalOwnership: e.verticalOwnership,
		...e.relativeHeight === void 0 ? {} : { relativeHeight: e.relativeHeight }
	});
}
function AS(e, t) {
	return Object.freeze({
		coordinateSpace: t,
		flowDomainId: e,
		entries: Object.freeze([])
	});
}
function jS(e, t) {
	return Object.freeze({
		coordinateSpace: e.coordinateSpace,
		flowDomainId: e.flowDomainId,
		baseEntries: e.entries,
		baseEntryCount: e.entries.length,
		entries: Object.freeze(t.map(kS))
	});
}
function MS(e, t) {
	if (t.coordinateSpace !== e.coordinateSpace) throw Error("DrawingML collision registry coordinate space mismatch");
	if (t.flowDomainId !== e.flowDomainId) throw Error("DrawingML collision registry flow domain mismatch");
	if (t.baseEntries !== e.entries || t.baseEntryCount !== e.entries.length) throw Error("DrawingML collision registry delta is stale");
	let n = new Set(e.entries.map((e) => e.occurrenceId));
	for (let e of t.entries) {
		if (OS(e), n.has(e.occurrenceId)) throw Error(`DrawingML collision occurrence committed twice: ${e.occurrenceId}`);
		n.add(e.occurrenceId);
	}
}
function NS(e, t) {
	return MS(e, t), Object.freeze({
		coordinateSpace: e.coordinateSpace,
		flowDomainId: e.flowDomainId,
		entries: Object.freeze([...e.entries, ...t.entries])
	});
}
//#endregion
//#region packages/docx/src/layout/anchor-classification.ts
function PS(e, t) {
	return Og(e, t);
}
function FS(e) {
	return Zi(e.wrapMode) && PS(e.anchorYRelativeFrom ?? null, e.anchorYFromPara ?? !1);
}
//#endregion
//#region packages/docx/src/vertical-text.ts
function IS(e) {
	let t = O(e);
	return t === "U" || t === "Tu" ? "upright" : t === "Tr" ? "rotate" : "sideways";
}
var LS = new Set([65294]);
function RS(e) {
	return LS.has(e) ? {
		dx: .4,
		dy: -.4
	} : {
		dx: 0,
		dy: 0
	};
}
function zS(e) {
	let t = [], n = "", r = null;
	for (let i of e) {
		let e = IS(i.codePointAt(0) ?? 0);
		r === null ? (r = e, n = i) : e === r ? n += i : (t.push({
			text: n,
			mode: r
		}), n = i, r = e);
	}
	return n !== "" && r !== null && t.push({
		text: n,
		mode: r
	}), t;
}
var BS = () => !1;
function VS(e, t, n) {
	let r = e.textBaseline;
	e.textBaseline = "alphabetic";
	let i = e.measureText(t);
	e.textBaseline = r;
	let a = i.fontBoundingBoxAscent, o = i.fontBoundingBoxDescent;
	return typeof a == "number" && typeof o == "number" && (a !== 0 || o !== 0) ? (a - o) / 2 : .38 * n;
}
function HS(e, t) {
	let n = e.textAlign, r = e.textBaseline;
	e.textAlign = "center", e.textBaseline = "middle";
	let i = e.measureText(t);
	e.textAlign = n, e.textBaseline = r;
	let a = i.actualBoundingBoxAscent, o = i.actualBoundingBoxDescent;
	return typeof a == "number" && typeof o == "number" ? (a - o) / 2 : 0;
}
function US(e) {
	return IS(e) === "rotate" && oe(e) === null && !Fe(e);
}
function WS(e) {
	let t = O(e);
	return t === "Tu" || t === "Tr";
}
function GS(e, t) {
	let n = e.textAlign, r = e.textBaseline;
	e.textAlign = "center", e.textBaseline = "middle";
	let i = e.measureText(t);
	e.textAlign = n, e.textBaseline = r;
	let a = i.actualBoundingBoxLeft, o = i.actualBoundingBoxRight;
	return typeof a != "number" || typeof o != "number" || !Number.isFinite(a) || !Number.isFinite(o) ? null : {
		extentPx: a + o,
		shiftPx: (a - o) / 2
	};
}
function KS(e, t, n, r, i, a, o) {
	let s = e.textAlign, c = e.textBaseline, l = () => (e.textAlign = n === "sideways" ? "left" : "center", e.textBaseline = n === "sideways" ? "alphabetic" : "middle", e.measureText(t)), u;
	try {
		u = o ? Ne(e, l) : l();
	} finally {
		e.textAlign = s, e.textBaseline = c;
	}
	if (n === "upright") {
		if (!Number.isFinite(u.actualBoundingBoxLeft) || !Number.isFinite(u.actualBoundingBoxRight)) return;
		let e = u.actualBoundingBoxLeft, t = u.actualBoundingBoxRight, n = a === "vertical-rl" ? 1 : i, o = -(r.xPt - e) * n, s = -(r.xPt + t) * n;
		return Object.freeze({
			startPt: Math.min(o, s),
			endPt: Math.max(o, s)
		});
	}
	if (!Number.isFinite(u.actualBoundingBoxAscent) || !Number.isFinite(u.actualBoundingBoxDescent)) return;
	let d = u.actualBoundingBoxAscent, f = u.actualBoundingBoxDescent, p = r.yPt - d, m = r.yPt + f;
	return Object.freeze({
		startPt: Math.min(p, m),
		endPt: Math.max(p, m)
	});
}
function qS(e, t, n, r, i) {
	let a = e.measureText(t).width;
	if (WS(n) && r(n)) {
		let n = fe(e, t);
		return {
			naturalPx: n.cellAdvancePx,
			vert: n,
			rotateInkShiftPx: 0
		};
	}
	if (i && US(n)) {
		let n = GS(e, t);
		if (n !== null && n.extentPx > a) return {
			naturalPx: n.extentPx,
			vert: null,
			rotateInkShiftPx: n.shiftPx
		};
	}
	return {
		naturalPx: a,
		vert: null,
		rotateInkShiftPx: 0
	};
}
function JS(e, t, n, r, i = 1, a = !1, o = BS, s = "vertical-rl") {
	let c = [], l = VS(e, t, n), u = 0, d = 0;
	for (let f of zS(t)) {
		if (f.mode === "sideways") {
			let t = [...f.text].length, n = e.measureText(f.text).width * i + r * t, a = {
				xPt: 0,
				yPt: l
			}, o = KS(e, f.text, "sideways", a, i, s, !1);
			c.push({
				range: {
					start: d,
					end: d + f.text.length
				},
				text: f.text,
				orientation: "sideways",
				originPt: u,
				advancePt: n,
				drawOffsetPt: a,
				verticalFeature: !1,
				...o ? { blockAxisInkBounds: o } : {}
			}), u += n, d += f.text.length;
			continue;
		}
		for (let t of f.text) {
			let l = t.codePointAt(0) ?? 0, f = IS(l), p = f === "rotate" ? oe(l) : null, m = f === "rotate" && p === null && Fe(l), h = qS(e, t, l, o, a), g = h.naturalPx * i + r, _ = {
				start: d,
				end: d + t.length
			};
			if (h.vert !== null) {
				let n = {
					xPt: 0,
					yPt: 0
				}, r = KS(e, t, "upright", n, i, s, !0);
				c.push({
					range: _,
					text: t,
					orientation: "upright",
					originPt: u + h.vert.originInCellPx * i,
					advancePt: g,
					drawOffsetPt: n,
					verticalFeature: !0,
					...r ? { blockAxisInkBounds: r } : {}
				});
			} else if (f === "upright" || p !== null || m) {
				let r = p === null ? B(l) : null, a = p ?? r, o = a === null ? t : String.fromCodePoint(a), d = a === null ? RS(l) : {
					dx: 0,
					dy: 0
				}, f = ro(r), m = d.dy === 0 && !f ? HS(e, o) / n : 0, h = {
					xPt: d.dx * n,
					yPt: (m + d.dy) * n
				}, v = KS(e, o, "upright", h, i, s, !1);
				c.push({
					range: _,
					text: o,
					orientation: "upright",
					originPt: u + g / 2,
					advancePt: g,
					drawOffsetPt: h,
					verticalFeature: !1,
					...v ? { blockAxisInkBounds: v } : {}
				});
			} else {
				let n = {
					xPt: 0,
					yPt: 0
				}, r = KS(e, t, "rotate", n, i, s, !1);
				c.push({
					range: _,
					text: t,
					orientation: "rotate",
					originPt: u + g / 2 + i * h.rotateInkShiftPx,
					advancePt: g,
					drawOffsetPt: n,
					verticalFeature: !1,
					...r ? { blockAxisInkBounds: r } : {}
				});
			}
			u += g, d += t.length;
		}
	}
	return c;
}
function YS(e, t, n) {
	let r = 0;
	for (let i of zS(t)) {
		if (i.mode === "sideways") {
			r += e.measureText(i.text).width;
			continue;
		}
		for (let t of i.text) {
			let i = qS(e, t, t.codePointAt(0) ?? 0, n, !0);
			r += i.naturalPx;
		}
	}
	return r - e.measureText(t).width;
}
function XS(e, t) {
	return YS(e, t, (t) => ne(e, t));
}
function ZS(e, t, n, r, i) {
	return {
		x: t,
		y: i - (e + n),
		w: r,
		h: n
	};
}
//#endregion
//#region packages/docx/src/layout/production-body-layout.ts
function QS(e, t, n, r) {
	let i = r.acquisitionInputs, a = () => r.bodySectionIndex, o = r.effectiveTablePositioning, s = r.publicAnchorBridge, c = ho(e.fontFamilyClasses, e.fontFamilyPitches), l = (e, t, n) => `${e}${t ? `|clr:${t}` : ""}${n ? `|duo:${n.clr1}:${n.clr2}` : ""}`;
	function u(e, t, n = {}, r, a = {}, o, c) {
		let l = cc(r, t), u = o;
		return {
			ctx: e,
			verticalGlyphMeasurement: zu(u),
			acquisitionInputs: i,
			contentX: t.marginLeft,
			contentW: t.pageWidth - t.marginLeft - t.marginRight,
			y: 0,
			pageH: t.pageHeight,
			pageIndex: 0,
			totalPages: Xu(u).totalPages,
			marginLeft: t.marginLeft,
			marginRight: t.marginRight,
			marginTop: vc(t.marginTop),
			marginBottom: vc(t.marginBottom),
			pageWidth: t.pageWidth,
			floats: [],
			floatParaSeq: 0,
			layoutSettings: r,
			sectionLayout: l,
			storyContext: Qb,
			docEastAsian: r.documentHasEastAsianText,
			fontFamilyClasses: n,
			resolvedLocalFonts: a,
			layoutServices: u,
			retainedTableAcquisition: {
				layoutServices: (e) => e.layoutServices,
				tableFormat: i.tableFormatInput,
				resolveColumns: m,
				createCellState: (e, t, n) => ({
					...rx(e),
					contentX: 0,
					contentW: t,
					y: 0,
					containerShading: n.background ?? e.containerShading,
					floats: [],
					floatParaSeq: 0,
					pageAnchorPrescanned: /* @__PURE__ */ new Set()
				}),
				acquireParagraph: (e, t, n, r, i, a, o, c) => {
					let l = c ?? {
						story: "body",
						storyInstance: "body",
						path: [...r]
					}, u = t.runs.filter((e, t) => s(e, l, t) !== null);
					u.length > 0 && E({
						...t,
						runs: u
					}, e, e.y);
					let d = nx(e, t), f = TS(e, e.acquisitionInputs.paragraphAcquisitionInput(t, l), {
						id: `${l.story}:${l.storyInstance}:${l.path.join(".")}`,
						source: l,
						flowDomainId: i,
						ordinaryFlow: !0,
						context: d,
						placement: {
							startYPt: e.y,
							paragraphXPt: 0,
							availableWidthPt: n,
							maximumYPt: e.pageH,
							suppressSpaceBefore: !0
						},
						measurer: {
							context: e.ctx,
							fontFamilyClasses: e.fontFamilyClasses
						},
						environment: Xb(e),
						exclusions: ES(e.floats, i),
						anchorCollisions: DS(e.floats),
						anchorCellBounds: {
							xPt: 0,
							yPt: 0,
							widthPt: n,
							heightPt: e.pageH
						},
						containerShading: e.containerShading,
						...a ? { paragraphBorderEdges: a } : {},
						trailingExtentPt: Math.max(d.spaceAfterPt, a?.bottom === "none" ? 0 : Rs(t.borders)),
						continuesFromPrevious: !1,
						anchorFrames: $b(e),
						acquireCompleteStory: e.acquireCompleteTextBoxStory
					}, o).layout;
					return t.spaceBefore === 0 ? f : Object.freeze({
						...f,
						flowBounds: Object.freeze({
							...f.flowBounds,
							heightPt: f.flowBounds.heightPt + t.spaceBefore
						}),
						advancePt: f.advancePt + t.spaceBefore,
						spacing: Object.freeze({
							...f.spacing,
							beforePt: t.spaceBefore
						})
					});
				},
				registerFloatingTable: (e, t) => {
					let n = !t.positioning.horzSpecified || t.positioning.horzAnchor !== "page" && t.positioning.horzAnchor !== "margin", r = t.positioning.vertAnchor !== "page" && t.positioning.vertAnchor !== "margin";
					if (!n || !r) return null;
					let i = e.pageH, a = {
						xPt: e.contentX,
						yPt: e.y,
						widthPt: e.contentW,
						heightPt: t.child.advancePt
					}, o = Nb(t.positioning, {
						page: {
							xPt: 0,
							yPt: 0,
							widthPt: e.pageWidth,
							heightPt: i
						},
						margin: {
							xPt: e.marginLeft,
							yPt: e.marginTop,
							widthPt: Math.max(0, e.pageWidth - e.marginLeft - e.marginRight),
							heightPt: Math.max(0, i - e.marginTop - e.marginBottom)
						},
						text: a
					}, t.child.columnWidthsPt.reduce((e, t) => e + t, 0), t.child.advancePt), s = Db(e, {
						x: o.x,
						y: o.y,
						w: o.w,
						h: o.h,
						dl: t.positioning.leftFromTextPt,
						dr: t.positioning.rightFromTextPt,
						dt: t.positioning.topFromTextPt,
						db: t.positioning.bottomFromTextPt,
						kind: "table",
						mode: "square",
						side: "bothSides",
						imageKey: "",
						paraId: e.floatParaSeq++,
						avoidOverlap: !0,
						tableOverlap: t.overlap
					});
					return Object.freeze({
						xPt: s.imageX - a.xPt,
						yPt: s.imageY - a.yPt
					});
				},
				advanceState: (e, t) => {
					e.y += t;
				}
			},
			retainedTablesBySourceIndex: /* @__PURE__ */ new Map(),
			currentDateMs: c?.currentDateMs,
			kinsoku: r.kinsoku,
			defaultTabPt: r.defaultTabPt,
			get verticalCJK() {
				return Gb(this.sectionLayout.textDirection);
			},
			get verticalAllRotated() {
				return Gb(this.sectionLayout.textDirection) && Kb(this.sectionLayout.textDirection);
			},
			verticalPhys: Wb(t) ? (() => {
				let e = Jb(t);
				return {
					pageWidth: e.pageWidth,
					pageHeight: e.pageHeight,
					marginLeft: e.marginLeft,
					marginRight: e.marginRight,
					marginTop: vc(e.marginTop),
					marginBottom: vc(e.marginBottom),
					physicalPageWidthPt: e.pageWidth
				};
			})() : void 0
		};
	}
	function d(e, t, n) {
		let r = (e) => {
			let t = Object.freeze({
				top: null,
				right: null,
				bottom: null,
				left: null,
				insideH: null,
				insideV: null
			});
			return Object.freeze({
				kind: "table",
				id: e.id,
				source: e.source,
				flowDomainId: e.flowDomainId,
				ordinaryFlow: !0,
				alignment: e.alignment,
				indentPt: e.indentPt,
				bidiVisual: e.bidiVisual,
				columnWidthsPt: e.columnWidthsPt,
				columnWidthKeys: e.columnWidthKeys,
				borders: t,
				rows: Object.freeze(e.rows.map((e) => Object.freeze({
					...e,
					exceptionBorders: e.sourceTableEdges
				})))
			});
		}, i = (t) => {
			if (t.story !== "body" || t.storyInstance !== "body" || t.path.length !== 1) throw Error("Body acquisition requires a top-level body source");
			let n = e.body[t.path[0]];
			if (!n || n.type !== "paragraph" && n.type !== "table") throw Error(`Body source does not identify a flow block: ${t.path.join(".")}`);
			return n;
		}, l = (t) => {
			if (t.story !== "body" || t.storyInstance !== "body" || t.path.length === 0 || (t.path.length - 1) % 3 != 0) throw Error("Nested body acquisition requires a canonical source path");
			let n = e.body[t.path[0]];
			for (let e = 1; e < t.path.length; e += 3) {
				if (!n || n.type !== "table") throw Error(`Nested body source leaves table ownership: ${t.path.join(".")}`);
				n = n.rows[t.path[e]]?.cells[t.path[e + 1]]?.content[t.path[e + 2]];
			}
			if (!n || n.type !== "paragraph" && n.type !== "table") throw Error(`Nested body source does not identify a flow block: ${t.path.join(".")}`);
			return n;
		}, d = (e, t, n, r, i, a, o = Object.freeze({ boundary: null }), s) => {
			let c = Qs(t) ?? {
				top: "top",
				bottom: "bottom"
			}, l = tx(e, t);
			return Bv(e.acquisitionInputs.paragraphAcquisitionInput(t, n), {
				id: `${n.story}:${n.storyInstance}:${n.path.join(".")}`,
				source: n,
				flowDomainId: r.flowDomainId,
				ordinaryFlow: !0,
				context: l,
				placement: {
					startYPt: e.y,
					paragraphXPt: r.availableBounds.xPt,
					availableWidthPt: i,
					maximumYPt: e.pageH,
					suppressSpaceBefore: a
				},
				measurer: {
					context: e.ctx,
					fontFamilyClasses: e.fontFamilyClasses
				},
				environment: Xb(e),
				exclusions: ES(e.floats, r.flowDomainId),
				anchorCollisions: s ?? DS(e.floats),
				containerShading: e.containerShading,
				paragraphBorderEdges: c,
				trailingExtentPt: Math.max(l.spaceAfterPt, c.bottom === "none" ? 0 : Rs(t.borders)),
				continuesFromPrevious: o.boundary !== null,
				...o.sourceRangeStart === void 0 ? {} : { sourceRangeStart: o.sourceRangeStart },
				anchorFrames: $b(e),
				acquireCompleteStory: e.acquireCompleteTextBoxStory
			}, o.boundary === null ? void 0 : {
				boundary: o.boundary,
				...o.uniformRubyAdvancePt === void 0 ? {} : { uniformRubyAdvancePt: o.uniformRubyAdvancePt }
			});
		};
		return Object.freeze({ openBodyLayoutSession(f, _, v) {
			if (!t) throw Error("Body layout acquisition requires a measurement context");
			let y = {
				...e.section,
				...f.section.geometry,
				textDirection: f.section.textDirection,
				vAlign: f.section.verticalAlignment
			}, b = u(t, Gb(y.textDirection) ? qb(y) : y, c, rc(e), n, _, v), x = iy(e.footnotes ?? []);
			b.noteNumbers = new Map([...[...ry(e.footnotes, ay(e.body, "footnote"))].map(([e, t]) => [`footnote:${e}`, t]), ...[...ry(e.endnotes, ay(e.body, "endnote"))].map(([e, t]) => [`endnote:${e}`, t])]);
			let S = /* @__PURE__ */ new Map();
			Ec(a()).occurrences.forEach((e) => {
				let t = e.markerBodyIndex === null ? null : `section:${e.markerBodyIndex}`;
				for (let n of [
					"default",
					"first",
					"even"
				]) {
					let r = t === null ? n : `${t}:${n}`, i = e.headers[n], a = e.footers[n];
					i && S.set(`header:${r}`, i), a && S.set(`footer:${r}`, a);
				}
			});
			let C = f.initialLocation, w = (e) => `body:page:${e}:registry`, T = Object.freeze({
				coordinateSpace: "logical-page-points",
				flowDomainId: w(C.pageIndex),
				entries: Object.freeze([]),
				nextParagraphId: 0
			}), O = AS(w(C.pageIndex), "logical-page-points"), k = (e, t) => {
				let n = t.section.geometry;
				e.sectionLayout = t.section, e.pageIndex = t.pageIndex;
				let r = Xu(_).resolveDestinationPage?.(t.pageIndex);
				e.displayPageNumber = r?.displayPageNumber ?? t.pageIndex + 1, e.pageNumberFormat = r?.pageNumberFormat ?? e.pageNumberFormat, e.pageWidth = n.pageWidth, e.pageH = n.pageHeight, e.marginLeft = n.marginLeft, e.marginRight = n.marginRight, e.marginTop = vc(n.marginTop), e.marginBottom = vc(n.marginBottom), e.contentX = t.availableBounds.xPt, e.contentW = t.availableBounds.widthPt, e.y = t.cursorPt.yPt;
			}, A = (e) => {
				C = e, k(b, e);
			};
			A(C);
			let j = (e, t, n, r, i = T.nextParagraphId) => {
				let a = new Set(T.entries.map((e) => e.occurrenceId)), o = e.runs.flatMap((i, o) => {
					if (i.type !== "shape" && i.type !== "image" && i.type !== "chart") return [];
					let c = s(i, t, o);
					return !c || r && !r.has(c.occurrenceId) || a.has(c.occurrenceId) || c.pageOwned && n.pageAnchorPrescanned?.has(e) ? [] : [{
						run: i,
						occurrenceId: c.occurrenceId
					}];
				});
				if (o.length === 0) return Object.freeze([]);
				let c = n.floats.length;
				E({
					...e,
					runs: o.map(({ run: e }) => e)
				}, n, n.y);
				let l = n.floats.slice(c);
				if (l.length !== o.length) throw Error("Public paragraph anchor acquisition did not retain every wrap float");
				return Object.freeze(l.map((e, t) => {
					let n = o[t].occurrenceId;
					return Object.freeze({
						kind: "shape",
						occurrenceId: n,
						exclusionId: n,
						paragraphId: i,
						bounds: Object.freeze({
							xPt: e.imageX,
							yPt: e.imageY,
							widthPt: e.imageW,
							heightPt: e.imageH
						}),
						exclusionBounds: Object.freeze({
							xPt: e.xLeft,
							yPt: e.yTop,
							widthPt: e.xRight - e.xLeft,
							heightPt: e.yBottom - e.yTop
						}),
						wrap: o[t].run.wrapMode,
						wrapSide: e.side,
						wrapDistances: Object.freeze({
							topPt: e.distTop,
							rightPt: e.distRight,
							bottomPt: e.distBottom,
							leftPt: e.distLeft
						}),
						...e.wrapPolygon ? { wrapPolygon: Object.freeze([...e.wrapPolygon]) } : {}
					});
				}));
			}, M = (e) => {
				let t = new Map((e.anchorFrames ?? []).flatMap((e) => {
					if (e.status !== "resolved") return [];
					let t = (e) => e.status === "resolved" && (e.referenceFrame === "paragraph" || e.referenceFrame === "line" || e.referenceFrame === "character");
					return t(e.axes.horizontal) || t(e.axes.vertical) ? [[e.occurrenceId, e]] : [];
				}));
				if (t.size === 0) return Object.freeze([]);
				let n = new Map(e.exclusions.flatMap((e) => e.anchorOccurrenceId ? [[e.anchorOccurrenceId, e]] : []));
				return Object.freeze((e.anchorCollisions ?? []).flatMap((e) => {
					let r = t.get(e.occurrenceId);
					if (!r || r.geometry.wrap.kind === "none") return [];
					let i = n.get(e.occurrenceId);
					if (!i) throw Error(`Wrapped anchor omitted exclusion geometry: ${e.occurrenceId}`);
					return [Object.freeze({
						kind: "shape",
						occurrenceId: e.occurrenceId,
						exclusionId: e.occurrenceId,
						paragraphId: T.nextParagraphId,
						bounds: e.bounds,
						exclusionBounds: i.bounds,
						horizontalOwnership: e.horizontalOwnership,
						verticalOwnership: e.verticalOwnership,
						wrap: r.geometry.wrap.kind,
						wrapSide: r.geometry.wrap.side,
						wrapDistances: r.geometry.wrap.distances,
						...r.geometry.wrap.polygon ? { wrapPolygon: r.geometry.wrap.polygon.points } : {}
					})];
				}));
			}, N = (e) => {
				if (e.acquired.kind !== "paragraph") return e.acquired;
				let t = l(e.acquired.source);
				if (t.type !== "paragraph") throw Error("Table paragraph re-acquisition source kind mismatch");
				let n = {
					...rx(b),
					contentX: 0,
					contentW: e.acquired.flowBounds.widthPt,
					y: e.acquired.flowBounds.yPt,
					floats: (e.floatingTableExclusions ?? []).map((e, t) => ({
						kind: "table",
						tableOverlap: "never",
						mode: "square",
						imageKey: `${r_}${t}`,
						imageX: e.xPt,
						imageY: e.yPt,
						imageW: e.widthPt,
						imageH: e.heightPt,
						xLeft: e.xPt,
						xRight: e.xPt + e.widthPt,
						yTop: e.yPt,
						yBottom: e.yPt + e.heightPt,
						side: "bothSides",
						distLeft: 0,
						distRight: 0,
						distTop: 0,
						distBottom: 0,
						paraId: t
					})),
					floatParaSeq: e.floatingTableExclusions?.length ?? 0,
					pageAnchorPrescanned: /* @__PURE__ */ new Set()
				}, r = i_(e.acquired);
				return b.retainedTableAcquisition.acquireParagraph(n, t, e.acquired.flowBounds.widthPt, e.acquired.source.path, e.acquired.flowDomainId, void 0, r);
			}, P = iy(e.endnotes ?? []), ee = /* @__PURE__ */ new Map(), F = (e) => {
				if (e.path.length !== 0) throw Error("Story acquisition requires a story-root source");
				if (e.story === "header" || e.story === "footer") {
					let t = S.get(`${e.story}:${e.storyInstance}`);
					if (!t) throw Error(`Unknown ${e.story} story source`);
					return t.body;
				}
				if (e.story === "footnote" || e.story === "endnote") {
					let t = (e.story === "footnote" ? x : P).get(e.storyInstance);
					if (!t) throw Error(`Unknown ${e.story} story source`);
					return t.content;
				}
				throw Error(`Unsupported shared story source: ${e.story}`);
			}, I = (e, t) => {
				if (t.path.length === 0 || (t.path.length - 1) % 3 != 0) throw Error("Story block acquisition requires a canonical source path");
				let n = e[t.path[0]];
				for (let e = 1; e < t.path.length; e += 3) {
					if (!n || n.type !== "table") throw Error(`Story source leaves table ownership: ${t.path.join(".")}`);
					n = n.rows?.[t.path[e]]?.cells[t.path[e + 1]]?.content[t.path[e + 2]];
				}
				if (!n || n.type !== "paragraph" && n.type !== "table") throw Error(`Story source does not identify a flow block: ${t.path.join(".")}`);
				return n;
			}, L = (e, t) => {
				let n = JSON.stringify({
					source: e.source,
					pageIndex: e.pageIndex,
					section: e.section,
					container: e.container
				}), r = ee.get(n);
				if (r) return r;
				let i = t ?? F(e.source), a = e.source.story === "footnote" || e.source.story === "endnote" ? b.noteNumbers?.get(`${e.source.story}:${e.source.storyInstance}`) : void 0, o = Xu(_), c = o.resolveDestinationPage?.(e.pageIndex), l = Gb(e.section.textDirection), u = {
					...b,
					sectionLayout: e.section,
					pageIndex: e.pageIndex,
					totalPages: o.totalPages,
					displayPageNumber: c?.displayPageNumber ?? e.pageIndex + 1,
					pageNumberFormat: c?.pageNumberFormat ?? b.pageNumberFormat,
					pageWidth: e.section.geometry.pageWidth,
					pageH: e.container.capacity === "unbounded" ? 2 ** 53 - 1 : e.section.geometry.pageHeight,
					marginLeft: e.section.geometry.marginLeft,
					marginRight: e.section.geometry.marginRight,
					marginTop: vc(e.section.geometry.marginTop),
					marginBottom: vc(e.section.geometry.marginBottom),
					contentX: e.container.bounds.xPt,
					contentW: e.container.bounds.widthPt,
					y: e.container.bounds.yPt,
					floats: [],
					floatParaSeq: 0,
					retainedTablesBySourceIndex: /* @__PURE__ */ new Map(),
					pageAnchorPrescanned: /* @__PURE__ */ new Set(),
					noteReferenceNumber: a,
					verticalCJK: l,
					verticalAllRotated: l && Kb(e.section.textDirection),
					...l ? {} : { verticalPhys: void 0 },
					storyContext: {
						story: e.source.story,
						containers: [],
						lineNumberingEligible: !1
					}
				};
				D(i, 0, u);
				let d = Ku(_);
				u.layoutServices = d;
				let f = i.flatMap((t, n) => {
					let r = {
						story: e.source.story,
						storyInstance: e.source.storyInstance,
						path: [n]
					};
					if (t.type === "unsupportedTextBoxBlock") return [{
						type: "unsupportedTextBoxBlock",
						qName: t.qName,
						sourcePath: t.sourcePath
					}];
					if (t.type === "paragraph") return [{
						kind: "paragraph",
						source: r
					}];
					if (t.type !== "table") throw Error(`Unsupported ${e.source.story} story block: ${t.type}`);
					let i = u.retainedTableAcquisition, a = t;
					return [Ux(a, m(a, e.container.bounds.widthPt, u), e.container.bounds.widthPt, u, r, i).input];
				}), p = null;
				Ay(d, {
					layoutParagraph(e, t) {
						let n = I(i, e.source);
						if (n.type !== "paragraph") throw Error("Story paragraph source kind mismatch");
						let r = e.source.path[0], a = r > 0 && i[r - 1]?.type === "paragraph" ? i[r - 1] : null, o = i[r + 1]?.type === "paragraph" ? i[r + 1] : null, c = p?.spaceAfter ?? 0, l = Zg(p, n, c, n.spaceBefore), d = Math.max(t.container.bounds.yPt, t.cursor.yPt - l.overlap);
						u.y = d, u.contentX = t.container.bounds.xPt, u.contentW = t.container.bounds.widthPt;
						let f = n.runs.filter((t, n) => s(t, e.source, n) !== null);
						f.length > 0 && E({
							...n,
							runs: f
						}, u, u.y);
						let m = nx(u, n), h = Ws(a, n, o), g = TS(u, u.acquisitionInputs.paragraphAcquisitionInput(n, e.source), {
							id: `${e.source.story}:${e.source.storyInstance}:${e.source.path.join(".")}`,
							source: e.source,
							flowDomainId: t.container.id,
							ordinaryFlow: !0,
							context: m,
							placement: {
								startYPt: d,
								paragraphXPt: t.container.bounds.xPt,
								availableWidthPt: t.container.bounds.widthPt,
								maximumYPt: t.availableBounds.yPt + t.availableBounds.heightPt,
								suppressSpaceBefore: l.suppressBefore
							},
							measurer: {
								context: u.ctx,
								fontFamilyClasses: u.fontFamilyClasses
							},
							environment: Xb(u),
							exclusions: ES(u.floats, t.container.id),
							anchorCollisions: DS(u.floats),
							containerShading: u.containerShading,
							paragraphBorderEdges: h,
							trailingExtentPt: Math.max(m.spaceAfterPt, h.bottom === "none" ? 0 : Rs(n.borders)),
							continuesFromPrevious: !1,
							anchorFrames: $b(u),
							acquireCompleteStory: u.acquireCompleteTextBoxStory
						});
						p = n;
						let _ = {
							xPt: t.cursor.xPt,
							yPt: d + g.layout.advancePt
						};
						return u.y = _.yPt, {
							layout: g.layout,
							nextCursor: _
						};
					},
					layoutTable(e, t) {
						p = null;
						let n = Lx({
							...e,
							flowDomainId: t.container.id
						}, t, d);
						return u.y = n.nextCursor.yPt, n;
					}
				});
				let h = Ny({
					source: e.source,
					container: e.container,
					blocks: Object.freeze(f)
				}, d), g = Object.freeze({
					...h,
					blocks: Object.freeze(h.blocks.map((t, n) => {
						if (t.kind !== "paragraph" && t.kind !== "table") throw Error(`Shared story emitted unsupported node: ${t.kind}`);
						return ch(t, {
							occurrenceId: `${e.container.id}:block:${n}`,
							destination: {
								coordinateSpace: "logical-page-points",
								flowDomainId: e.container.id,
								translation: {
									xPt: 0,
									yPt: 0
								}
							}
						});
					}))
				});
				return ee.set(n, g), g;
			};
			b.acquireCompleteTextBoxStory = (e) => {
				let t = e.coordinateSpace === "upright-physical" ? {
					...b.sectionLayout,
					geometry: bc(b.sectionLayout.geometry),
					textDirection: "lrTb"
				} : b.sectionLayout;
				return L({
					source: e.source,
					pageIndex: b.pageIndex,
					section: t,
					container: e.container
				}, e.blocks);
			};
			let te = {
				hasPaginationFields: t_(e.body, e.footnotes ?? [], [...[...S.values()].map((e) => e.body), ...(e.endnotes ?? []).map((e) => e.content)]),
				measureParagraph(t) {
					A(t.location);
					let n = i(t.input.source);
					if (n.type !== "paragraph") throw Error("Paragraph source kind mismatch");
					if (n.framePr) {
						if (t.continuation.boundary !== null) throw Error("Body frame acquisition cannot continue across flow regions");
						let r, i = Zs(n);
						if (!i) throw Error("Body frame acquisition requires an indexed adjacency group");
						let a = g(n, i, b, h(e.body, n, b), (e) => {
							r = e;
						});
						if (!r) throw Error("Body frame acquisition omitted its retained group");
						let o = r.members.find((e) => e.paragraph === n);
						if (!o) throw Error("Body frame acquisition omitted its retained member");
						let s = n.framePr.vAnchor === "page" || n.framePr.vAnchor === "margin", c = a.exclusionId ?? `frame:${t.input.source.path.join(":")}`, l = Object.freeze({
							kind: "frame",
							occurrenceId: c,
							exclusionId: c,
							paragraphId: T.nextParagraphId,
							bounds: Object.freeze({
								xPt: a.x,
								yPt: a.y,
								widthPt: a.w,
								heightPt: a.h
							}),
							exclusionBounds: Object.freeze({
								xPt: a.exLeft,
								yPt: a.exTop,
								widthPt: a.exRight - a.exLeft,
								heightPt: a.exBottom - a.exTop
							})
						});
						return Object.freeze({
							layout: o.fragment,
							blockExtentPt: 0,
							lineEndBoundaries: Object.freeze([]),
							placement: Object.freeze({
								coordinateSpace: "logical-body",
								xPt: o.fragment.flowBounds.xPt,
								yPt: o.fragment.flowBounds.yPt,
								sectionFlowOwnership: s ? "page" : "host-flow"
							}),
							...n === i.owner ? { retainedFootnoteReferenceIds: Object.freeze([...new Set(r.members.flatMap((e) => uy(e.fragment)))]) } : {},
							...s ? {} : { relocationBlockExtentPt: Math.max(0, a.y + a.h - t.location.cursorPt.yPt) },
							...a.registerExclusion === !1 ? {} : { flowRegistryDelta: Object.freeze({ floats: Ib(T, Object.freeze([l]), T.nextParagraphId + 1) }) }
						});
					}
					let r = {
						...b,
						floats: [...b.floats],
						pageAnchorPrescanned: new Set(b.pageAnchorPrescanned)
					};
					k(r, t.location);
					let a = t.continuation.boundary === null ? j(n, t.input.source, r) : Object.freeze([]), { measured: o, layout: s } = d(r, n, t.input.source, t.location, t.availableInlineExtentPt, t.suppressSpaceBefore, t.continuation, O.entries), c = o.lines.map((e) => {
						let t = e.layout.consumedEnd;
						if (!t) throw Error("Measured line omitted its source boundary");
						return t;
					}), l = M(s), u = Object.freeze([...a, ...l]), f = o_(s);
					return Object.freeze({
						layout: s,
						blockExtentPt: s.advancePt,
						lineEndBoundaries: Object.freeze(c),
						...o.markOnly ? { markBelowBaselinePt: o.lastLineBelowBaselinePt } : {},
						...o.uniformRubyAdvancePt == null ? {} : { uniformRubyAdvancePt: o.uniformRubyAdvancePt },
						...u.length === 0 && f.length === 0 ? {} : { flowRegistryDelta: Object.freeze({
							...u.length === 0 ? {} : { floats: Ib(T, u, T.nextParagraphId + u.length) },
							...f.length === 0 ? {} : { drawingCollisions: jS(O, f) }
						}) }
					});
				},
				measureTable(e) {
					if (A(e.location), e.input.kind === "adjacent-table-group") {
						if (e.cursor && e.cursor.kind !== "adjacent-table-group") throw Error("Adjacent table group acquisition received an ordinary table cursor");
						let t = e.input.tables.map((t) => {
							let n = i(t.source);
							if (n.type !== "table") throw Error("Table source kind mismatch");
							let r = t.source.path[0];
							return p(b, n, e.availableInlineExtentPt, r), ix(b, r).acquisition;
						}), n = r(eS(e.input.logicalSequenceId, t.map((e) => e.input))), a = {
							container: {
								id: e.location.flowDomainId,
								kind: "body",
								bounds: {
									xPt: 0,
									yPt: 0,
									widthPt: e.availableInlineExtentPt,
									heightPt: e.freshPageBlockExtentPt
								}
							},
							cursor: {
								xPt: 0,
								yPt: 0
							},
							availableBounds: {
								xPt: 0,
								yPt: 0,
								widthPt: e.availableInlineExtentPt,
								heightPt: e.freshPageBlockExtentPt
							}
						}, o = Lx(n, a, _).layout, s = {};
						t.forEach((e) => Object.entries(e.nestedById).forEach(([e, t]) => {
							if (s[e] && s[e] !== t) throw Error(`Adjacent table group has duplicate nested table id: ${e}`);
							s[e] = t;
						}));
						let c = Object.freeze({
							input: n,
							layout: o,
							nestedById: Object.freeze(s),
							floatingTables: Object.freeze(t.flatMap((e) => e.floatingTables))
						}), l = e.cursor?.cursor ?? Object.freeze({
							tableIndex: 0,
							sourceRowIndex: 0
						}), u = e.input.tables.slice(0, l.tableIndex).reduce((e, t) => e + (t.rowCount ?? 0), 0) + l.sourceRowIndex, d = l.tableCursor ?? Object.freeze({
							...rS(),
							rowIndex: u
						});
						if (d.rowIndex !== u) throw Error("Adjacent-table group and table-fragment cursors disagree");
						let f = wS(c, d, {
							availableHeightPt: e.availableBlockExtentPt,
							freshPageHeightPt: e.freshPageBlockExtentPt,
							placement: a,
							services: _,
							compatibility: "word",
							page: {
								physicalPageIndex: e.location.pageIndex,
								displayPageNumber: e.location.pageIndex + 1,
								occurrenceId: `${n.id}:body:${e.location.pageIndex}`
							}
						});
						if (!f.fragment || f.requiresFreshPage) return Object.freeze({
							layout: c.layout,
							blockExtentPt: 0,
							nextCursor: Object.freeze({
								kind: "adjacent-table-group",
								cursor: l
							}),
							requiresFreshFlowRegion: !0
						});
						let m = f.nextCursor ? (() => {
							let t = 0, n = 0;
							for (; t < e.input.tables.length;) {
								let r = e.input.tables[t].rowCount ?? 0;
								if (f.nextCursor.rowIndex < n + r) break;
								n += r, t += 1;
							}
							return t >= e.input.tables.length ? null : Object.freeze({
								tableIndex: t,
								sourceRowIndex: f.nextCursor.rowIndex - n,
								tableCursor: f.nextCursor
							});
						})() : null;
						return Object.freeze({
							layout: f.fragment,
							blockExtentPt: f.fragment.advancePt,
							nextCursor: m ? Object.freeze({
								kind: "adjacent-table-group",
								cursor: m
							}) : null,
							...f.floatingTableRegistryDelta ? { flowRegistryDelta: Object.freeze({ floats: f.floatingTableRegistryDelta }) } : {}
						});
					}
					let t = i(e.input.source);
					if (t.type !== "table") throw Error("Table source kind mismatch");
					let n = e.input.source.path[0];
					p(b, t, e.availableInlineExtentPt, n);
					let a = ix(b, n).acquisition;
					if (e.cursor && e.cursor.kind !== "table") throw Error("Ordinary table acquisition received an adjacent-group cursor");
					let s = e.cursor?.cursor ?? rS(), c = b.pageH, l = b.acquisitionInputs.tableFormatInput(t).positioning;
					if (l) {
						let n = e.cursor?.kind === "table" && e.cursor.floatingContinuationFrame === "fresh-text" ? Object.freeze({
							...l,
							vertAnchor: "text",
							yPt: 0,
							yAlign: void 0
						}) : l, r = a.layout.columnWidthsPt.reduce((e, t) => e + t, 0), i = Object.freeze({
							page: Object.freeze({
								xPt: 0,
								yPt: 0,
								widthPt: b.pageWidth,
								heightPt: c
							}),
							margin: Object.freeze({
								xPt: b.marginLeft,
								yPt: b.marginTop,
								widthPt: Math.max(0, b.pageWidth - b.marginLeft - b.marginRight),
								heightPt: Math.max(0, c - b.marginTop - b.marginBottom)
							}),
							text: Object.freeze({
								xPt: e.location.cursorPt.xPt,
								yPt: e.location.cursorPt.yPt,
								widthPt: e.availableInlineExtentPt,
								heightPt: a.layout.advancePt
							})
						}), o = Nb(n, i, r, a.layout.advancePt);
						if (e.cursor?.kind !== "table" && (n.vertAnchor === "page" || n.vertAnchor === "margin") && Wi({
							bounds: {
								xPt: o.x,
								yPt: o.y,
								widthPt: o.w,
								heightPt: o.h
							},
							blockers: T.entries.map(Fi),
							overlapEpsilonPt: .01
						}).defer) return Object.freeze({
							layout: a.layout,
							blockExtentPt: 0,
							nextCursor: Object.freeze({
								kind: "table",
								cursor: s,
								floatingContinuationFrame: "authored"
							}),
							requiresFreshFlowRegion: !0
						});
						let u = (n.vertAnchor === "page" || n.vertAnchor === "margin") && a.layout.advancePt > e.freshPageBlockExtentPt, d = u ? e.location.availableBounds.yPt + e.location.availableBounds.heightPt : n.vertAnchor === "page" ? i.page.yPt + i.page.heightPt : n.vertAnchor === "margin" ? i.margin.yPt + i.margin.heightPt : e.location.availableBounds.yPt + e.location.availableBounds.heightPt, f = u ? e.freshPageBlockExtentPt : n.vertAnchor === "page" ? i.page.heightPt : n.vertAnchor === "margin" ? i.margin.heightPt : e.freshPageBlockExtentPt, p;
						try {
							p = Ma({
								step: (r) => {
									if (r?.kind === "fresh-flow-region" || r?.kind === "candidate" && r.resolved.placement.xPt === r.parentFrame.xPt && r.resolved.placement.yPt === r.parentFrame.yPt) return r;
									let c = r?.resolved.placement ?? {
										xPt: o.x,
										yPt: o.y
									}, l = Math.max(0, d - c.yPt), u = wS(a, s, {
										availableHeightPt: l,
										freshPageHeightPt: f,
										placement: {
											container: {
												id: `${e.location.flowDomainId}:floating-table`,
												kind: "body",
												bounds: {
													xPt: 0,
													yPt: 0,
													widthPt: e.availableInlineExtentPt,
													heightPt: l
												}
											},
											cursor: {
												xPt: 0,
												yPt: 0
											},
											availableBounds: {
												xPt: 0,
												yPt: 0,
												widthPt: e.availableInlineExtentPt,
												heightPt: l
											}
										},
										services: _,
										compatibility: "word",
										oversizedRowPolicy: "atomic",
										page: {
											physicalPageIndex: e.location.pageIndex,
											displayPageNumber: b.displayPageNumber ?? e.location.pageIndex + 1,
											occurrenceId: `${a.input.id}:fitting-outer:${e.location.pageIndex}:${s.rowIndex}:${s.rowFragmentIndex}`
										},
										floatingTableFrames: {
											page: i.page,
											margin: i.margin,
											column: i.text
										},
										floatingTableRegistry: T,
										finalPlacementTranslationPt: c,
										reacquirePageDependentBlock: N
									});
									if (!u.fragment || u.requiresFreshPage) return Object.freeze({
										kind: "fresh-flow-region",
										result: u
									});
									let p = Object.freeze({
										kind: "floating-table-placement",
										occurrenceId: `${a.input.id}:root:${e.location.pageIndex}:${s.rowIndex}:${s.rowFragmentIndex}`,
										ownership: "source",
										physicalPageIndex: e.location.pageIndex,
										displayPageNumber: b.displayPageNumber ?? e.location.pageIndex + 1,
										hostCellId: e.location.flowDomainId,
										sourceBlockIndex: e.input.source.path[0],
										anchorBlockIndex: e.input.source.path[0],
										tableId: u.fragment.id,
										overlap: t.overlap === "never" ? "never" : "overlap",
										positioning: n,
										anchorBounds: i.text,
										child: u.fragment
									}), m = u.floatingTableRegistryDelta?.entries ?? [], h = u.floatingTableRegistryDelta?.nextParagraphId ?? T.nextParagraphId, g = zb(p, i, Rb(T.entries, h, T.coordinateSpace, T.flowDomainId)), v = JSON.stringify({
										parentFrame: {
											xPt: g.placement.xPt,
											yPt: g.placement.yPt
										},
										fragment: u.fragment,
										nestedEntries: m,
										resolvedBounds: g.placement.bounds
									});
									return Object.freeze({
										kind: "candidate",
										parentFrame: Object.freeze({
											xPt: c.xPt,
											yPt: c.yPt
										}),
										result: u,
										fragment: u.fragment,
										resolved: g,
										nestedEntries: m,
										fingerprint: v
									});
								},
								stateOf: (e) => e.kind === "fresh-flow-region" ? "fresh-flow-region" : e.fingerprint,
								limit: 16
							}).value;
						} catch (e) {
							throw e instanceof ja ? new J("NON_CONVERGENCE", e.reason === "cycle" ? "Floating table parent/child transaction repeated an exact-state cycle" : "Floating table parent/child transaction reached the operational pass limit 16") : e;
						}
						if (p.kind === "fresh-flow-region") return Object.freeze({
							layout: a.layout,
							blockExtentPt: 0,
							nextCursor: Object.freeze({
								kind: "table",
								cursor: s,
								floatingContinuationFrame: "fresh-text"
							}),
							requiresFreshFlowRegion: !0
						});
						let { result: m, fragment: h, resolved: g, nestedEntries: v } = p, y = e.cursor?.kind === "table" && e.cursor.floatingContinuationFrame !== void 0, x = e.location.availableBounds.yPt + e.location.availableBounds.heightPt, S = [...h.resolvedFloatingTables ?? [], g.placement].filter((e) => e.source.positioning.vertAnchor === "text");
						return !y && S.some((e) => e.exclusionBounds.yPt + e.exclusionBounds.heightPt > x) ? Object.freeze({
							layout: h,
							blockExtentPt: 0,
							nextCursor: Object.freeze({
								kind: "table",
								cursor: s,
								floatingContinuationFrame: "fresh-text"
							}),
							requiresFreshFlowRegion: !0
						}) : Object.freeze({
							layout: h,
							blockExtentPt: 0,
							nextCursor: m.nextCursor ? Object.freeze({
								kind: "table",
								cursor: m.nextCursor,
								floatingContinuationFrame: "fresh-text"
							}) : null,
							flowRegistryDelta: Object.freeze({ floats: Ib(T, Object.freeze([...v, ...g.transaction.delta]), g.transaction.nextParagraphId) }),
							placement: Object.freeze({
								coordinateSpace: "logical-body",
								xPt: g.placement.xPt,
								yPt: g.placement.yPt,
								sectionFlowOwnership: n.vertAnchor === "page" || n.vertAnchor === "margin" ? "page" : "host-flow"
							})
						});
					}
					if (b.verticalPhys && !o(t)) {
						if (e.cursor) throw Error("An upright physical table must remain atomic");
						let t = b.verticalPhys, n = a.layout.columnWidthsPt.reduce((e, t) => e + t, 0);
						if (n > e.availableBlockExtentPt && e.availableBlockExtentPt < e.freshPageBlockExtentPt) return Object.freeze({
							layout: a.layout,
							blockExtentPt: 0,
							nextCursor: Object.freeze({
								kind: "table",
								cursor: s
							}),
							requiresFreshFlowRegion: !0
						});
						let r = t.physicalPageWidthPt - e.location.cursorPt.yPt - n, i = e.location.cursorPt.xPt, o = Math.max(a.layout.advancePt, t.pageHeight - t.marginTop - t.marginBottom), c = `upright-physical-page:${e.location.pageIndex}`, l = wS(a, rS(), {
							availableHeightPt: o,
							freshPageHeightPt: o,
							placement: {
								container: {
									id: c,
									kind: "body",
									bounds: {
										xPt: 0,
										yPt: 0,
										widthPt: n,
										heightPt: o
									}
								},
								cursor: {
									xPt: 0,
									yPt: 0
								},
								availableBounds: {
									xPt: 0,
									yPt: 0,
									widthPt: n,
									heightPt: o
								}
							},
							services: _,
							compatibility: "word",
							oversizedRowPolicy: "atomic",
							page: {
								physicalPageIndex: e.location.pageIndex,
								displayPageNumber: b.displayPageNumber ?? e.location.pageIndex + 1,
								occurrenceId: `${a.input.id}:upright-page:${e.location.pageIndex}`
							},
							floatingTableFrames: {
								page: {
									xPt: 0,
									yPt: 0,
									widthPt: t.pageWidth,
									heightPt: t.pageHeight
								},
								margin: {
									xPt: t.marginLeft,
									yPt: t.marginTop,
									widthPt: Math.max(0, t.pageWidth - t.marginLeft - t.marginRight),
									heightPt: Math.max(0, t.pageHeight - t.marginTop - t.marginBottom)
								},
								column: {
									xPt: t.marginLeft,
									yPt: t.marginTop,
									widthPt: Math.max(0, t.pageWidth - t.marginLeft - t.marginRight),
									heightPt: Math.max(0, t.pageHeight - t.marginTop - t.marginBottom)
								}
							},
							floatingTableRegistry: Object.freeze({
								coordinateSpace: "upright-physical-page-points",
								flowDomainId: c,
								entries: Object.freeze([]),
								nextParagraphId: 0
							}),
							finalPlacementTranslationPt: {
								xPt: r,
								yPt: i
							},
							reacquirePageDependentBlock: N
						});
						if (!l.fragment || l.nextCursor || l.requiresFreshPage) throw Error("Upright table final-frame layout must remain atomic");
						return Object.freeze({
							layout: l.fragment,
							blockExtentPt: n,
							nextCursor: null,
							placement: Object.freeze({
								coordinateSpace: "upright-physical",
								xPt: r + l.fragment.flowBounds.xPt,
								yPt: i + l.fragment.flowBounds.yPt,
								sectionFlowOwnership: "host-flow"
							})
						});
					}
					let u = wS(a, s, {
						availableHeightPt: e.availableBlockExtentPt,
						freshPageHeightPt: e.freshPageBlockExtentPt,
						placement: {
							container: {
								id: e.location.flowDomainId,
								kind: "body",
								bounds: {
									xPt: 0,
									yPt: 0,
									widthPt: e.availableInlineExtentPt,
									heightPt: e.availableBlockExtentPt
								}
							},
							cursor: {
								xPt: 0,
								yPt: 0
							},
							availableBounds: {
								xPt: 0,
								yPt: 0,
								widthPt: e.availableInlineExtentPt,
								heightPt: e.availableBlockExtentPt
							}
						},
						services: _,
						compatibility: "word",
						page: {
							physicalPageIndex: e.location.pageIndex,
							displayPageNumber: e.location.pageIndex + 1,
							occurrenceId: `${a.input.id}:body:${e.location.pageIndex}`
						},
						floatingTableFrames: {
							page: {
								xPt: 0,
								yPt: 0,
								widthPt: b.pageWidth,
								heightPt: c
							},
							margin: {
								xPt: b.marginLeft,
								yPt: b.marginTop,
								widthPt: Math.max(0, b.pageWidth - b.marginLeft - b.marginRight),
								heightPt: Math.max(0, c - b.marginTop - b.marginBottom)
							},
							column: e.location.availableBounds
						},
						floatingTableRegistry: T,
						finalPlacementTranslationPt: {
							xPt: e.location.availableBounds.xPt,
							yPt: e.location.cursorPt.yPt
						},
						reacquirePageDependentBlock: N
					}), d = e.location.availableBounds.xPt + a.layout.flowBounds.xPt, f = d + a.layout.flowBounds.widthPt, m = u.fragment?.advancePt ?? 0, h = Ui({
						inlineStartPt: d,
						inlineEndPt: f,
						blockStartPt: e.location.cursorPt.yPt,
						blockExtentPt: m,
						blockers: T.entries.map(Fi),
						overlapEpsilonPt: ji
					}).blockStartPt;
					return h > e.location.cursorPt.yPt ? Object.freeze({
						layout: a.layout,
						blockExtentPt: 0,
						nextCursor: e.cursor ?? null,
						retryAtBlockStartPt: h
					}) : !u.fragment || u.requiresFreshPage ? Object.freeze({
						layout: a.layout,
						blockExtentPt: 0,
						nextCursor: Object.freeze({
							kind: "table",
							cursor: s
						}),
						requiresFreshFlowRegion: !0
					}) : Object.freeze({
						layout: u.fragment,
						blockExtentPt: u.fragment.advancePt,
						nextCursor: u.nextCursor ? Object.freeze({
							kind: "table",
							cursor: u.nextCursor
						}) : null,
						...u.floatingTableRegistryDelta ? { flowRegistryDelta: Object.freeze({ floats: u.floatingTableRegistryDelta }) } : {}
					});
				},
				layoutStory: L,
				layoutNotes(e) {
					let t = [], n = e.container.bounds.yPt, r = e.firstOnPage;
					for (let i of e.referenceIds) {
						if (!(e.kind === "footnote" ? x : P).has(i)) continue;
						let a = {
							story: e.kind,
							storyInstance: i,
							path: []
						}, o = r ? 6 : 0, s = {
							...e.container,
							id: `${e.container.id}:${e.kind}:${i}`,
							bounds: {
								...e.container.bounds,
								yPt: n + o,
								heightPt: Math.max(0, e.container.bounds.yPt + e.container.bounds.heightPt - n - o)
							}
						}, c;
						try {
							c = L({
								source: a,
								pageIndex: e.pageIndex,
								section: e.section,
								container: s
							});
						} catch (t) {
							throw t instanceof Ty && t.containerId === s.id ? new Am(e.kind, e.pageIndex, e.container.id) : t;
						}
						let l = Object.freeze(r ? [Object.freeze({
							edge: "top",
							from: Object.freeze({
								xPt: e.container.bounds.xPt,
								yPt: n + o / 2
							}),
							to: Object.freeze({
								xPt: e.container.bounds.xPt + e.container.bounds.widthPt / 3,
								yPt: n + o / 2
							}),
							color: "#000000",
							widthPt: .5,
							authoredStyle: "single",
							style: "solid"
						})] : []), u = o + c.advancePt, d = Object.freeze({
							xPt: e.container.bounds.xPt,
							yPt: n,
							widthPt: e.container.bounds.widthPt,
							heightPt: u
						}), f = Object.freeze({
							kind: "note",
							id: `${e.kind}:${i}:page:${e.pageIndex}`,
							source: a,
							flowDomainId: e.container.id,
							ordinaryFlow: !0,
							flowBounds: d,
							inkBounds: Object.freeze({
								xPt: Math.min(d.xPt, c.inkBounds.xPt),
								yPt: Math.min(d.yPt, c.inkBounds.yPt),
								widthPt: Math.max(d.xPt + d.widthPt, c.inkBounds.xPt + c.inkBounds.widthPt) - Math.min(d.xPt, c.inkBounds.xPt),
								heightPt: Math.max(d.yPt + d.heightPt, c.inkBounds.yPt + c.inkBounds.heightPt) - Math.min(d.yPt, c.inkBounds.yPt)
							}),
							clipBounds: e.container.bounds,
							advancePt: u,
							separator: l,
							story: c
						});
						t.push(f), n += u, r = !1;
					}
					return Object.freeze(t);
				},
				measureFollowingBlock(e) {
					let t = {
						...b,
						floats: [...b.floats],
						retainedTablesBySourceIndex: new Map(b.retainedTablesBySourceIndex)
					};
					if (k(t, e.location), e.input.kind === "adjacent-table-group") {
						let n = e.input.tables.map((n) => {
							let r = i(n.source);
							if (r.type !== "table") throw Error("Following table source kind mismatch");
							let a = n.source.path[0];
							return p(t, r, e.availableInlineExtentPt, a), ix(t, a).acquisition;
						}), a = Lx(r(eS(e.input.logicalSequenceId, n.map((e) => e.input))), {
							container: {
								id: e.location.flowDomainId,
								kind: "body",
								bounds: e.location.availableBounds
							},
							cursor: e.location.cursorPt,
							availableBounds: e.location.availableBounds
						}, _).layout;
						return Object.freeze({
							fullExtentPt: a.advancePt,
							leadContentExtentPt: a.rows[0]?.advancePt ?? a.advancePt,
							fullFootnoteReferenceIds: uy(a),
							leadFootnoteReferenceIds: uy({
								...a,
								rows: a.rows.slice(0, 1)
							})
						});
					}
					let n = i(e.input.source);
					if (e.input.kind === "paragraph") {
						if (n.type !== "paragraph") throw Error("Following paragraph source kind mismatch");
						let { layout: r } = d(t, n, e.input.source, e.location, e.availableInlineExtentPt, !1, void 0, O.entries), i = r.lines[0];
						return Object.freeze({
							fullExtentPt: r.advancePt,
							leadContentExtentPt: i ? i.bounds.yPt + i.advancePt - r.flowBounds.yPt : r.advancePt,
							fullFootnoteReferenceIds: uy(r),
							leadFootnoteReferenceIds: i ? ly([i]) : []
						});
					}
					if (n.type !== "table") throw Error("Following table source kind mismatch");
					let a = e.input.source.path[0];
					p(t, n, e.availableInlineExtentPt, a);
					let o = ix(t, a).acquisition.layout;
					return Object.freeze({
						fullExtentPt: o.advancePt,
						leadContentExtentPt: o.rows[0]?.advancePt ?? o.advancePt,
						fullFootnoteReferenceIds: uy(o),
						leadFootnoteReferenceIds: uy({
							...o,
							rows: o.rows.slice(0, 1)
						})
					});
				},
				prescanPageAnchors(e) {
					let t = e.location.section.geometry, n = vc(t.marginTop), r = vc(t.marginBottom), a = Object.freeze({
						page: Object.freeze({
							xPt: 0,
							yPt: 0,
							widthPt: t.pageWidth,
							heightPt: t.pageHeight
						}),
						margin: Object.freeze({
							xPt: t.marginLeft,
							yPt: n,
							widthPt: Math.max(0, t.pageWidth - t.marginLeft - t.marginRight),
							heightPt: Math.max(0, t.pageHeight - n - r)
						}),
						column: Object.freeze({
							xPt: e.location.availableBounds.xPt,
							yPt: n,
							widthPt: e.availableInlineExtentPt,
							heightPt: Math.max(0, t.pageHeight - n - r)
						}),
						paragraph: null,
						line: null,
						character: null,
						pageParity: e.location.pageIndex % 2 == 0 ? "odd" : "even"
					}), o = /* @__PURE__ */ new Set(), c = (e) => `${e.story}:${e.storyInstance}:${e.path.join(".")}`, l = /* @__PURE__ */ new Map(), u = (e) => {
						let t = c(e);
						return l.has(t) || l.set(t, T.nextParagraphId + l.size), l.get(t);
					}, d = e.anchors.flatMap((t) => {
						let n = i(t.paragraphSource);
						if (n.type !== "paragraph") throw Error("Page-anchor prescan source kind mismatch");
						let r = b.acquisitionInputs.paragraphAcquisitionInput(n, t.paragraphSource), c = r.runs.filter((e) => e.type === "anchorHost" && e.anchorOccurrenceId === t.occurrenceId), l = r.runs.map((e, t) => ({
							run: e,
							runIndex: t
						})).filter((e) => (e.run.type === "image" || e.run.type === "chart" || e.run.type === "shape" || e.run.type === "unavailableDrawing") && e.run.anchorAcquisitionInput?.occurrenceId === t.occurrenceId).sort((e, t) => (e.run.anchorAcquisitionInput.group?.sourceIndex ?? 0) - (t.run.anchorAcquisitionInput.group?.sourceIndex ?? 0) || e.runIndex - t.runIndex);
						if (c.length !== 1 || l.length === 0) {
							let r = n.runs.find((e, n) => s(e, t.paragraphSource, n)?.occurrenceId === t.occurrenceId);
							if (r) {
								if ((r.type === "image" || r.type === "chart" || r.type === "shape") && r.wrapMode === "none") return [];
								let i = {
									...b,
									floats: [...b.floats],
									pageAnchorPrescanned: new Set(b.pageAnchorPrescanned)
								};
								k(i, e.location);
								let a = j(n, t.paragraphSource, i, new Set([t.occurrenceId]), u(t.paragraphSource));
								if (a.length !== 1) throw Error(`Public page-anchor prescan occurrence mismatch: ${t.occurrenceId}`);
								return o.add(n), a;
							}
							throw Error(`Page-anchor prescan occurrence acquisition mismatch: ${t.occurrenceId}`);
						}
						let d = Yg({
							acquisition: l[0].run.anchorAcquisitionInput,
							frames: a
						});
						if (d.status !== "resolved") throw Error(`Page-anchor prescan could not resolve occurrence: ${t.occurrenceId}`);
						let f = Gb(e.location.section.textDirection) ? (() => {
							let t = Td(e.location.section.textDirection);
							return gv(d, Nd(t, jd({
								widthPt: a.page.widthPt,
								heightPt: a.page.heightPt
							}, t)));
						})() : d, p = f.geometry.wrapBounds;
						if (p === null || f.geometry.wrap.kind === "none") return [];
						let m = f.geometry.wrap.polygon?.points ?? Object.freeze([
							Object.freeze({
								xPt: p.xPt,
								yPt: p.yPt
							}),
							Object.freeze({
								xPt: p.xPt + p.widthPt,
								yPt: p.yPt
							}),
							Object.freeze({
								xPt: p.xPt + p.widthPt,
								yPt: p.yPt + p.heightPt
							}),
							Object.freeze({
								xPt: p.xPt,
								yPt: p.yPt + p.heightPt
							})
						]);
						return [Object.freeze({
							kind: "shape",
							occurrenceId: t.occurrenceId,
							paragraphId: u(t.paragraphSource),
							bounds: f.geometry.objectFrame,
							exclusionBounds: p,
							wrap: f.geometry.wrap.kind,
							wrapSide: f.geometry.wrap.side,
							wrapDistances: f.geometry.wrap.distances,
							wrapPolygon: Object.freeze([...m])
						})];
					});
					return o.forEach((e) => b.pageAnchorPrescanned?.add(e)), d.length === 0 ? null : Object.freeze({ floats: Object.freeze({
						coordinateSpace: "logical-page-points",
						flowDomainId: T.flowDomainId,
						baseEntries: T.entries,
						baseNextParagraphId: T.nextParagraphId,
						nextParagraphId: T.nextParagraphId + d.length,
						entries: Object.freeze(d)
					}) });
				},
				measureLineNumberGlyph(n) {
					let r = t.font;
					try {
						let r = Yb(e), i = vo(!1, !1, r, null, {});
						t.font = i;
						let a = t.measureText(n);
						return Object.freeze({
							widthPt: a.width,
							ascentPt: a.fontBoundingBoxAscent ?? a.actualBoundingBoxAscent ?? r * .8,
							descentPt: a.fontBoundingBoxDescent ?? a.actualBoundingBoxDescent ?? r * .2,
							font: i
						});
					} finally {
						t.font = r;
					}
				},
				resetPageAcquisition(e) {
					b.floats = [], b.floatParaSeq = 0, b.pageAnchorPrescanned = /* @__PURE__ */ new Set(), T = Object.freeze({
						coordinateSpace: "logical-page-points",
						flowDomainId: w(e.pageIndex),
						entries: Object.freeze([]),
						nextParagraphId: 0
					}), O = AS(w(e.pageIndex), "logical-page-points"), A(e);
				},
				moveAcquisitionCursor: A,
				flowRegistrySnapshot() {
					return Object.freeze({
						floats: T,
						drawingCollisions: O
					});
				},
				commitFlowRegistryDelta(e) {
					if (!e.floats && !e.drawingCollisions) throw Error("Body flow registry delta must update at least one registry");
					e.floats && Lb(e.floats, {
						coordinateSpace: T.coordinateSpace,
						flowDomainId: T.flowDomainId,
						entries: T.entries,
						nextParagraphId: T.nextParagraphId
					}), e.drawingCollisions && MS(O, e.drawingCollisions);
					let t = e.drawingCollisions ? NS(O, e.drawingCollisions) : O, n = (e.floats?.entries ?? []).map((e) => {
						let t = e.wrapDistances?.leftPt ?? e.bounds.xPt - e.exclusionBounds.xPt, n = e.wrapDistances?.topPt ?? e.bounds.yPt - e.exclusionBounds.yPt, r = e.wrapDistances?.rightPt ?? e.exclusionBounds.xPt + e.exclusionBounds.widthPt - e.bounds.xPt - e.bounds.widthPt, i = e.wrapDistances?.bottomPt ?? e.exclusionBounds.yPt + e.exclusionBounds.heightPt - e.bounds.yPt - e.bounds.heightPt, a = {
							mode: e.wrap === "topAndBottom" ? "topAndBottom" : "square",
							...e.kind === "shape" ? {
								anchorOccurrenceId: e.occurrenceId,
								acquisitionOccurrenceId: e.occurrenceId
							} : {},
							...e.wrap ? {
								authoredWrap: e.wrap,
								wrapPolygon: e.wrapPolygon
							} : {},
							imageKey: e.exclusionId ?? (e.kind === "table" ? `body:float:${e.paragraphId}` : ""),
							imageX: e.bounds.xPt,
							imageY: e.bounds.yPt,
							imageW: e.bounds.widthPt,
							imageH: e.bounds.heightPt,
							xLeft: e.exclusionBounds.xPt,
							xRight: e.exclusionBounds.xPt + e.exclusionBounds.widthPt,
							yTop: e.exclusionBounds.yPt,
							yBottom: e.exclusionBounds.yPt + e.exclusionBounds.heightPt,
							side: e.wrapSide ?? "bothSides",
							distLeft: t,
							distRight: r,
							distTop: n,
							distBottom: i,
							paraId: e.paragraphId
						};
						return e.kind === "table" ? {
							...a,
							kind: "table",
							tableOverlap: e.overlap
						} : {
							...a,
							kind: e.kind
						};
					});
					e.floats && (b.floats.push(...n), T = Object.freeze({
						...T,
						entries: Object.freeze([...T.entries, ...e.floats.entries]),
						nextParagraphId: e.floats.nextParagraphId
					}), b.floatParaSeq = e.floats.nextParagraphId), O = t;
				}
			};
			return Object.freeze(te);
		} });
	}
	function f(e, t) {
		return Zb(t, nx(t, e));
	}
	function p(e, t, n, r) {
		let i = e.retainedTablesBySourceIndex.get(r), a = m(t, n, e), o = e.retainedTableAcquisition, s = Ux(t, a, n, e, [r], o), c = i?.contentWidthPt === n ? Object.freeze({
			...s,
			layout: Object.freeze({
				...s.layout,
				columnWidthsPt: i.acquisition.layout.columnWidthsPt
			})
		}) : s;
		e.retainedTablesBySourceIndex.set(r, Object.freeze({
			sourceIndex: r,
			acquisition: c,
			contentWidthPt: n,
			anchorYPt: e.y
		}));
		let l = c.layout.rows.map((e) => e.advancePt);
		return {
			colWidthsPt: a,
			rowContentHeightsPt: l,
			rowHeightsPt: l
		};
	}
	function m(e, t, n) {
		let r = n.acquisitionInputs.tableFormatInput(e), i = /* @__PURE__ */ new WeakMap();
		e.rows.forEach((t, n) => t.cells.forEach((t, a) => {
			let o = r.rows[n]?.cells[a]?.marginsPt;
			i.set(t, o ?? j(t, e));
		}));
		let a = Number.isFinite(e.tblInd) ? e.tblInd ?? 0 : 0, o = r.rows.map((e) => {
			let t = e.exception;
			return t?.indentAuthored ? t.indentPt ?? 0 : a;
		}), s = n.storyContext?.story, c = n.storyContext?.containers.length === 0 && (s === "header" || s === "footer" || s === "body" && n.sectionLayout?.columns.length === 1), l = r.ordinaryFlow && c && !Gb(n.sectionLayout.textDirection) && [a, ...o].some((e) => e < 0), u = r.rows.length === 0 ? [{
			justification: e.jc,
			indentPt: a
		}] : r.rows.map((t, n) => ({
			justification: t.justification ?? e.jc,
			indentPt: o[n] ?? a
		})), d = e.bidiVisual === !0, f = Math.min(n.pageWidth, ...u.map(({ justification: e, indentPt: r }) => {
			let i = e === "right" || e === "end", a = e === "center" ? "center" : (d ? !i : i) ? "right" : "left", o = d ? -r : r;
			if (a === "left") {
				let e = n.contentX + o;
				return n.pageWidth - e;
			}
			if (a === "right") return n.contentX + t + o;
			let s = n.contentX + t / 2 + o;
			return 2 * Math.min(s, n.pageWidth - s);
		})), p = l ? Math.max(t, f) : t;
		return [...xr(n.acquisitionInputs.tableColumnLayoutInput(e, t, (r) => js(r, i.get(r) ?? j(r, e), {
			paragraph: (e) => {
				let r = uc(n.layoutSettings, n.sectionLayout, n.storyContext ?? Qb, e), i = e.numbering ? n.acquisitionInputs.numberingMarkerShapeInput(e.numbering, xo(e)) : void 0, a = Ds(r, {
					numbering: e.numbering,
					...i ? { markerInput: i } : {},
					authoredFirstIndentPt: e.indentFirst,
					tabStops: e.tabStops,
					defaultTabPt: n.defaultTabPt,
					service: n.layoutServices?.text,
					clusterGeometry: !1
				}), o = a.numberingMarkerGeometry ?? (e.numbering && i && n.layoutServices?.text ? As(e.numbering, i, {
					authoredFirstIndentPt: e.indentFirst,
					physicalIndentLeftPt: a.physicalIndentLeftPt,
					tabStops: e.tabStops,
					defaultTabPt: n.defaultTabPt
				}, n.layoutServices.text, !1) : void 0);
				return Ls(e, a, t, {
					context: n.ctx,
					fontFamilyClasses: n.fontFamilyClasses
				}, Xb(n), o);
			},
			nestedTable: (e) => {
				let r = m(e, t, n).reduce((e, t) => e + t, 0);
				return {
					minWidthPt: r,
					maxWidthPt: r
				};
			}
		}), n.acquisitionInputs.tableParticipatesInOrdinaryFlow(e) ? p : Math.max(t, n.pageWidth)))];
	}
	function h(e, t, n) {
		let r = e.indexOf(t);
		for (let t = r + 1; t < e.length; t++) {
			let r = e[t];
			if (r.type !== "paragraph") continue;
			let i = r;
			if (!i.framePr) return Uo(i, 1, f(i, n), tx(n, i).hasRuby, n.docEastAsian, n.ctx, n.fontFamilyClasses, i.lineSpacing, n.resolvedLocalFonts, n.layoutServices?.text, n.acquisitionInputs.paragraphMarkShapeInput(i));
		}
		let i = t;
		return Uo(i, 1, f(i, n), tx(n, i).hasRuby, n.docEastAsian, n.ctx, n.fontFamilyClasses, i.lineSpacing, n.resolvedLocalFonts, n.layoutServices?.text, n.acquisitionInputs.paragraphMarkShapeInput(i));
	}
	function g(e, t, n, r, i) {
		let a = {
			context: n.ctx,
			fontFamilyClasses: n.fontFamilyClasses
		}, o = Xb(n), s = t.members.map(Qs), c = xb(t.framePr.hAnchor, n), l = {
			contentXPt: n.contentX,
			contentWidthPt: n.contentW,
			pageHeightPt: n.pageH,
			yPt: n.y,
			anchorLineHeightPt: r
		}, u = Wv(t, {
			contexts: t.members.map((e) => tx(n, e)),
			inputs: t.members.map((e, r) => n.acquisitionInputs.paragraphAcquisitionInput(e, {
				story: "body",
				storyInstance: "body",
				path: [t.sourceIndices[r]]
			})),
			borderEdges: s,
			borderExtentsPt: t.members.map((e, t) => s[t]?.bottom === "none" ? 0 : Rs(e.borders)),
			measurer: a,
			environment: o,
			containerShading: n.containerShading,
			maximumWidthPt: Math.max(0, c.right - c.left),
			acquisitionSession: n,
			placementSignature: [
				l.contentXPt,
				l.contentWidthPt,
				l.pageHeightPt,
				l.yPt,
				l.anchorLineHeightPt,
				n.pageWidth,
				n.marginLeft,
				n.marginRight,
				n.marginTop,
				n.marginBottom
			].join("|"),
			place: (e, r) => {
				let i = Eb(t.framePr, n, l.yPt, e, r, l.anchorLineHeightPt);
				return Object.freeze({
					bounds: Object.freeze({
						xPt: i.x,
						yPt: i.y,
						widthPt: i.w,
						heightPt: i.h
					}),
					exclusionBounds: Object.freeze({
						xPt: i.exLeft,
						yPt: i.exTop,
						widthPt: i.exRight - i.exLeft,
						heightPt: i.exBottom - i.exTop
					})
				});
			},
			anchorFrames: $b(n)
		});
		i?.(u);
		let d = {
			x: u.box.bounds.xPt,
			y: u.box.bounds.yPt,
			w: u.box.bounds.widthPt,
			h: u.box.bounds.heightPt,
			exLeft: u.box.exclusionBounds.xPt,
			exTop: u.box.exclusionBounds.yPt,
			exRight: u.box.exclusionBounds.xPt + u.box.exclusionBounds.widthPt,
			exBottom: u.box.exclusionBounds.yPt + u.box.exclusionBounds.heightPt,
			registerExclusion: !0,
			exclusionId: u.box.exclusionId
		};
		return e === t.owner ? d : {
			...d,
			registerExclusion: !1
		};
	}
	function _(e, t, n) {
		if (t.verticalPhys) {
			let n = _(e, w(t), t.contentX);
			return ZS(n.x, n.y, n.w, n.h, t.verticalPhys.physicalPageWidthPt);
		}
		let r = e.widthPt, i = e.heightPt, a = e.anchorXPt, o = e.anchorYPt, s = e.groupWidthPt ?? null, c = e.groupHeightPt ?? null;
		if (e.widthPct != null) {
			let n = Bb(e.widthRelativeFrom, !1, t), i = (n.end - n.start) * e.widthPct;
			if (e.groupWidthPt != null && e.groupWidthPt > 0) {
				let t = i / e.groupWidthPt;
				r = e.widthPt * t, a = e.anchorXPt * t;
			} else r = i;
			s = i;
		}
		if (e.heightPct != null) {
			let r = Vb(e.heightRelativeFrom, !1, n, t), a = (r.end - r.start) * e.heightPct;
			if (e.groupHeightPt != null && e.groupHeightPt > 0) {
				let t = a / e.groupHeightPt;
				i = e.heightPt * t, o = e.anchorYPt * t;
			} else i = a;
			c = a;
		}
		return {
			x: Hb(e.anchorXAlign, e.anchorXFromMargin, a, r, t, e.anchorXRelativeFrom, e.pctPosH, s),
			y: Ub(e.anchorYAlign, e.anchorYFromPara, o, i, n, t, e.anchorYRelativeFrom, e.pctPosV, c),
			w: r,
			h: i
		};
	}
	let v = (e, t, n) => T(e, t, n), y = (e, t, n) => _(e, t, n), b = (e) => Jb(e), x = (e) => qb(e), S = (e, t, n) => D(e, t, n);
	function C(e) {
		let t = e.verticalPhys;
		return t ? {
			...e,
			pageWidth: t.pageWidth,
			marginLeft: t.marginLeft,
			marginRight: t.marginRight,
			marginTop: t.marginTop,
			marginBottom: t.marginBottom,
			pageH: t.pageHeight
		} : e;
	}
	function w(e) {
		let t = e.verticalPhys;
		return t ? {
			...C(e),
			contentX: t.marginLeft,
			contentW: t.pageWidth - t.marginLeft - t.marginRight,
			verticalCJK: !1,
			verticalAllRotated: !1,
			verticalPhys: void 0,
			floats: []
		} : e;
	}
	function T(e, t, n) {
		let r = e.widthPt, i = e.heightPt, a = e.distLeft ?? 0, o = e.distRight ?? 0, s = e.distTop ?? 0, c = e.distBottom ?? 0;
		if (t.verticalPhys) {
			let n = C(t), l = ZS(Hb(e.anchorXAlign, e.anchorXFromMargin ?? !1, e.anchorXPt ?? 0, r, n, e.anchorXRelativeFrom ?? null, null, null), Ub(e.anchorYAlign, e.anchorYFromPara ?? !1, e.anchorYPt ?? 0, i, t.contentX, n, e.anchorYRelativeFrom ?? null, null, null), r, i, t.verticalPhys.physicalPageWidthPt);
			return {
				x: l.x,
				y: l.y,
				w: l.w,
				h: l.h,
				dl: s,
				dr: c,
				dt: o,
				db: a
			};
		}
		return {
			x: Hb(e.anchorXAlign, e.anchorXFromMargin ?? !1, e.anchorXPt ?? 0, r, t, e.anchorXRelativeFrom ?? null, null, null),
			y: Ub(e.anchorYAlign, e.anchorYFromPara ?? !1, e.anchorYPt ?? 0, i, n, t, e.anchorYRelativeFrom ?? null, null, null),
			w: r,
			h: i,
			dl: a,
			dr: o,
			dt: s,
			db: c
		};
	}
	function E(e, t, n) {
		let r = t.floatParaSeq++, i = t.pageAnchorPrescanned?.has(e) ?? !1;
		for (let a of e.runs) if (a.type === "image") {
			let e = a;
			if (i && FS(e)) continue;
			O(e, t, n, r);
		} else if (a.type === "chart") {
			let e = a;
			if (i && FS(e)) continue;
			k(e, t, n, r);
		} else if (a.type === "shape") {
			let e = a;
			if (i && FS(e)) continue;
			A(e, t, n, r);
		}
	}
	function D(e, t, n) {
		n.pageAnchorPrescanned ||= /* @__PURE__ */ new Set();
		for (let r = t; r < e.length; r++) {
			let t = e[r];
			if (!t) continue;
			if (t.type === "pageBreak") break;
			if (t.type === "sectionBreak") {
				let e = t;
				if (e.kind && e.kind !== "continuous") break;
				continue;
			}
			if (t.type !== "paragraph") continue;
			let i = t;
			if (n.pageAnchorPrescanned.has(i)) continue;
			let a = !1;
			for (let e of i.runs) if (e.type === "image") {
				if (FS(e)) {
					a = !0;
					break;
				}
			} else if (e.type === "chart") {
				if (FS(e)) {
					a = !0;
					break;
				}
			} else if (e.type === "shape" && FS(e)) {
				a = !0;
				break;
			}
			if (!a) continue;
			let o = n.floatParaSeq++;
			for (let e of i.runs) if (e.type === "image") {
				let t = e;
				if (!FS(t)) continue;
				O(t, n, 0, o);
			} else if (e.type === "chart") {
				let t = e;
				if (!FS(t)) continue;
				k(t, n, 0, o);
			} else if (e.type === "shape") {
				let t = e;
				if (!FS(t)) continue;
				A(t, n, 0, o);
			}
			n.pageAnchorPrescanned.add(i);
		}
	}
	function O(e, t, n, r) {
		if (!e.anchor || !Zi(e.wrapMode)) return;
		let i = e.wrapMode === "topAndBottom" ? "topAndBottom" : "square", a = T(e, t, n), { w: o, h: s, dl: c, dr: u, dt: d, db: f } = a, p = e.allowOverlap ?? !0, m = l(e.imagePath, e.colorReplaceFrom, e.duotone);
		Db(t, {
			x: a.x,
			y: a.y,
			w: o,
			h: s,
			dl: c,
			dr: u,
			dt: d,
			db: f,
			kind: "shape",
			mode: i,
			side: e.wrapSide ?? "bothSides",
			imageKey: m,
			paraId: r,
			avoidOverlap: !0,
			allowOverlap: p
		});
	}
	function k(e, t, n, r) {
		if (!e.anchor || !Zi(e.wrapMode)) return;
		let i = T(e, t, n), { w: a, h: o, dl: s, dr: c, dt: l, db: u } = i;
		a <= 0 || o <= 0 || Db(t, {
			x: i.x,
			y: i.y,
			w: a,
			h: o,
			dl: s,
			dr: c,
			dt: l,
			db: u,
			kind: "shape",
			mode: e.wrapMode === "topAndBottom" ? "topAndBottom" : "square",
			side: e.wrapSide ?? "bothSides",
			allowOverlap: e.allowOverlap ?? !0,
			avoidOverlap: !0,
			paraId: r,
			imageKey: ""
		});
	}
	function A(e, t, n, r) {
		if (!Zi(e.wrapMode)) return;
		let { x: i, y: a, w: o, h: s } = _(e, t, n);
		if (o <= 0 || s <= 0) return;
		let c = e.wrapMode === "topAndBottom" ? "topAndBottom" : "square", l = e.distLeft ?? 0, u = e.distRight ?? 0, d = e.distTop ?? 0, f = e.distBottom ?? 0, p = !!t.verticalPhys;
		Db(t, {
			x: i,
			y: a,
			w: o,
			h: s,
			dl: p ? d : l,
			dr: p ? f : u,
			dt: p ? u : d,
			db: p ? l : f,
			kind: "shape",
			mode: c,
			side: e.wrapSide ?? "bothSides",
			imageKey: "",
			paraId: r,
			avoidOverlap: !0,
			allowOverlap: !0
		});
	}
	function j(e, t) {
		return {
			top: e.marginTop ?? t.cellMarginTop,
			bottom: e.marginBottom ?? t.cellMarginBottom,
			left: e.marginLeft ?? t.cellMarginLeft,
			right: e.marginRight ?? t.cellMarginRight
		};
	}
	let M = d(e, t, n);
	return Object.freeze({
		kernel: M,
		internals: Object.freeze({
			resolveColumnWidths: m,
			resolveAnchorBox: v,
			resolveShapeBox: y,
			physicalLayoutSection: b,
			verticalLayoutSection: x,
			preRegisterPageFloats: S
		})
	});
}
//#endregion
//#region packages/docx/src/document-content.ts
function* $S(e) {
	e.textPath && (yield {
		text: e.textPath.string,
		fontFamilies: [e.textPath.fontFamily],
		bold: e.textPath.bold,
		italic: e.textPath.italic
	});
	for (let t of e.textBlocks ?? []) yield* eC(t);
}
function* eC(e) {
	if (e.numbering && (yield {
		text: e.numbering.text,
		fontFamilies: [e.numbering.fontFamily, e.numbering.fontFamilyEastAsia],
		bold: !1,
		italic: !1
	}), e.runs?.length) for (let t of e.runs) yield {
		text: t.text,
		fontFamilies: [
			t.fontFamily,
			t.fontFamilyEastAsia,
			e.fontFamily
		],
		bold: t.bold ?? e.bold,
		italic: t.italic ?? e.italic
	};
	else yield {
		text: e.text,
		fontFamilies: [e.fontFamily],
		bold: e.bold,
		italic: e.italic
	};
}
function* tC(e) {
	if (e.type === "text") {
		let t = e;
		yield {
			text: e.text,
			fontFamilies: [
				e.fontFamily,
				t.fontFamilyHighAnsi,
				e.fontFamilyEastAsia
			],
			bold: e.bold,
			italic: e.italic
		}, yield {
			text: e.text,
			fontFamilies: [e.fontFamilyCs],
			bold: e.boldCs ?? !1,
			italic: e.italicCs ?? !1
		};
	} else if (e.type === "field") {
		let t = e;
		yield {
			text: t.fallbackText,
			fontFamilies: [
				t.fontFamily,
				t.fontFamilyHighAnsi,
				t.fontFamilyEastAsia
			],
			bold: t.bold,
			italic: t.italic
		}, yield {
			text: t.fallbackText,
			fontFamilies: [t.fontFamilyCs],
			bold: t.boldCs ?? !1,
			italic: t.italicCs ?? !1
		};
	} else e.type === "shape" ? yield* $S(e) : e.type === "anchorHost" && (yield {
		text: "",
		fontFamilies: [e.fontFamily, e.fontFamilyEastAsia],
		bold: e.bold,
		italic: e.italic
	});
}
function* nC(e) {
	yield {
		text: "",
		fontFamilies: [e.defaultFontFamily, e.defaultFontFamilyEastAsia]
	}, e.numbering && (yield {
		text: e.numbering.text,
		fontFamilies: [e.numbering.fontFamily, e.numbering.fontFamilyEastAsia]
	});
	for (let t of e.runs) yield* tC(t);
}
function* rC(e) {
	for (let t of e.rows) for (let e of t.cells) yield* aC(e.content);
}
function* iC(e) {
	if (e) for (let t of [
		e.default,
		e.first,
		e.even
	]) t && (yield* aC(t.body));
}
function* aC(e) {
	for (let t of e) t.type === "paragraph" ? yield* nC(t) : t.type === "table" ? yield* rC(t) : t.type === "sectionBreak" && (yield* iC(t.headers), yield* iC(t.footers));
}
function* oC(e) {
	yield* aC(e.body ?? []), yield* iC(e.headers), yield* iC(e.footers);
	for (let t of [...e.footnotes ?? [], ...e.endnotes ?? []]) yield* aC(t.content);
}
function sC(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of oC(e)) for (let e of n.fontFamilies) {
		let n = e?.trim();
		n && t.add(n);
	}
	return [...t];
}
//#endregion
//#region packages/docx/src/google-fonts.ts
var cC = {
	...n,
	...o
};
function* lC(e) {
	for (let t of oC(e)) yield t.text;
}
function uC(e) {
	let t = v(e.majorFont) ?? v(e.minorFont) ?? null;
	return [
		e.majorFont,
		e.minorFont,
		...Re(lC(e), t)
	];
}
//#endregion
//#region packages/docx/src/layout/font-service.ts
function dC(e) {
	return e.trim().toLocaleLowerCase("en-US");
}
function fC(e) {
	return e == null || !Number.isFinite(e) ? 400 : Math.min(900, Math.max(100, Math.round(e / 100) * 100));
}
function pC(e) {
	return Object.freeze({
		...e,
		diagnostics: Object.freeze([...e.diagnostics])
	});
}
function mC(e) {
	return `"${e.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}
function hC(e, t) {
	return `${mC(e)}, ${t}`;
}
function gC(e, t = {}) {
	let n = {
		embedded: 0,
		local: 1,
		google: 2,
		substitute: 3
	}, r = e.filter((e) => e.requestedFamily.trim() && e.resolvedFamily.trim()).map((e) => Object.freeze({
		...e,
		weight: fC(e.weight),
		style: e.style ?? "normal"
	})).sort((e, t) => dC(e.requestedFamily).localeCompare(dC(t.requestedFamily)) || n[e.source] - n[t.source] || e.resolvedFamily.localeCompare(t.resolvedFamily) || e.weight - t.weight || e.style.localeCompare(t.style)), i = /* @__PURE__ */ new Map();
	for (let e of r) {
		let t = dC(e.requestedFamily);
		i.set(t, [...i.get(t) ?? [], e]);
	}
	let a = Object.freeze(Object.fromEntries(Object.entries(t.nativeFamilyLists ?? {}).filter(([e, t]) => e.trim() && t.trim()).map(([e, t]) => [dC(e), t]).sort(([e], [t]) => e.localeCompare(t)))), o = On("fonts", {
		faces: r,
		nativeFamilyLists: a
	});
	return Object.freeze({
		fingerprint: o,
		resolve(e) {
			let t = e.requestedFamily?.trim() || e.genericFamily || "sans-serif", n = fC(e.weight), r = e.style ?? "normal", o = (i.get(dC(t)) ?? []).find((e) => e.weight === n && e.style === r);
			if (o) {
				let i = o.source === "substitute" ? [{
					code: "UNSUPPORTED_FEATURE",
					severity: "warning",
					message: `ECMA-376 §17.8.2 implementation-dependent font substitution: ${t} resolved to ${o.resolvedFamily}`
				}] : [], a = hC(o.resolvedFamily, e.genericFamily ?? "sans-serif");
				return pC({
					requestedFamily: t,
					resolvedFamily: o.resolvedFamily,
					route: it(a, "registered"),
					source: o.source,
					weight: n,
					style: r,
					diagnostics: i,
					genericFamily: e.genericFamily ?? "sans-serif"
				});
			}
			let s = e.genericFamily ?? "sans-serif", c = e.requestedFamily?.trim();
			return pC(c ? {
				requestedFamily: t,
				resolvedFamily: c,
				route: it(a[dC(c)] ?? hC(c, s), "native"),
				source: "native",
				weight: n,
				style: r,
				diagnostics: [],
				genericFamily: s
			} : {
				requestedFamily: t,
				resolvedFamily: s,
				route: it(s, "generic"),
				source: "generic",
				weight: n,
				style: r,
				diagnostics: [],
				genericFamily: s
			});
		}
	});
}
//#endregion
//#region packages/docx/src/layout/paint-resources.ts
function _C(e, t) {
	if (typeof e != "string" || e.trim().length === 0) throw TypeError(`${t} must be a non-empty string`);
}
function vC(e, t) {
	if (!Number.isFinite(e) || e < 0) throw TypeError(`${t} must be finite and non-negative`);
}
function yC(e, t) {
	if (!Number.isFinite(e)) throw TypeError(`${t} must be finite`);
}
function bC(e, t) {
	if (!Number.isFinite(e) || e < 0 || e > 1) throw TypeError(`${t} must be between 0 and 1`);
}
function xC(e, t) {
	vC(e.widthPt, `${t}.widthPt`), vC(e.heightPt, `${t}.heightPt`);
}
function SC(e) {
	switch (_C(e.resourceKey, "resourceKey"), e.kind) {
		case "image":
		case "picture-bullet":
			if (e.documentOrder !== void 0 && (!Number.isSafeInteger(e.documentOrder) || e.documentOrder < 0)) throw TypeError("documentOrder must be a non-negative safe integer");
			if (_C(e.partPath, "partPath"), _C(e.mimeType, "mimeType"), e.svgImagePath !== void 0 && _C(e.svgImagePath, "svgImagePath"), xC(e.intrinsicSize, "intrinsicSize"), e.alpha !== void 0 && bC(e.alpha, "alpha"), e.rotation !== void 0 && !Number.isFinite(e.rotation)) throw TypeError("rotation must be finite");
			e.srcRect !== void 0 && (yC(e.srcRect.l, "srcRect.l"), yC(e.srcRect.t, "srcRect.t"), yC(e.srcRect.r, "srcRect.r"), yC(e.srcRect.b, "srcRect.b"));
			break;
		case "chart":
			xC(e.intrinsicSize, "intrinsicSize");
			break;
		case "math": break;
		default: throw TypeError(`Unknown paint resource kind: ${String(e)}`);
	}
}
function CC(e) {
	return SC(e), H(e, `paint resource ${e.resourceKey}`);
}
function wC(e, t, n) {
	return /* @__PURE__ */ Error(`Paint resource kind mismatch for ${e}: expected ${t}, got ${n}`);
}
function TC(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e) {
		if (t.has(n.resourceKey)) throw Error(`Duplicate paint resource key: ${n.resourceKey}`);
		t.add(n.resourceKey);
	}
	let n = e.map(CC).sort((e, t) => e.resourceKey.localeCompare(t.resourceKey)), r = Object.freeze(n), i = new Map(r.map((e) => [e.resourceKey, e])), a = Object.freeze(r.map((e) => e.resourceKey));
	return Object.freeze({
		keys: a,
		descriptors: r,
		resolve(e, t) {
			let n = i.get(e);
			if (!n) throw Error(`Unknown paint resource: ${e}`);
			if (n.kind !== t) throw wC(e, t, n.kind);
			return n;
		}
	});
}
//#endregion
//#region packages/docx/src/layout/production-paint-resources.ts
function EC(e) {
	return On("chart-resource", e);
}
function DC(e, t, n, r = {}) {
	return {
		kind: e,
		resourceKey: t,
		partPath: n,
		...r.svgImagePath === void 0 ? {} : { svgImagePath: r.svgImagePath },
		...r.srcRect == null ? {} : { srcRect: { ...r.srcRect } },
		...r.rotation === void 0 ? {} : { rotation: r.rotation },
		...r.flipH === void 0 ? {} : { flipH: r.flipH },
		...r.flipV === void 0 ? {} : { flipV: r.flipV },
		...r.alpha === void 0 ? {} : { alpha: r.alpha },
		...r.colorReplaceFrom === void 0 ? {} : { colorReplaceFrom: r.colorReplaceFrom },
		...r.duotone === void 0 ? {} : { duotone: { ...r.duotone } }
	};
}
function OC(e, t, n) {
	let r = [], i = [], a = (e, t) => {
		if (e.type === "image") {
			r.push(DC("image", jn(t, e.imagePath), e.imagePath, e));
			return;
		}
		if (e.type === "chart") {
			i.push({
				kind: "chart",
				resourceKey: EC(t),
				intrinsicSize: {
					widthPt: e.widthPt,
					heightPt: e.heightPt
				},
				model: e.chart
			});
			return;
		}
		if (e.type !== "shape") return;
		let n = `${t.story}:${t.storyInstance}:${t.path.join(".")}`;
		e.textBlocks?.forEach((e, t) => {
			if (!e.imagePath) return;
			let i = {
				story: "textbox",
				storyInstance: n,
				path: [t, 0]
			};
			r.push(DC("image", jn(i, e.imagePath), e.imagePath, { svgImagePath: e.svgImagePath }));
		});
	}, o = (e, t, n, r) => {
		e.rows.forEach((e, i) => e.cells.forEach((e, a) => {
			l(e.content, t, n, [
				...r,
				i,
				a
			]);
		}));
	}, s = (e, t, n) => {
		if (e) for (let r of [
			"default",
			"first",
			"even"
		]) {
			let i = e[r];
			i && l(i.body, t, n ? `${n}:${r}` : r);
		}
	}, c = (e, t) => {
		let i = e.numbering;
		i?.picBulletImagePath && r.push(DC("picture-bullet", jn(t, i.picBulletImagePath), i.picBulletImagePath)), (n?.paragraphAcquisitionInput(e, t).runs ?? e.runs).forEach((e, n) => {
			(e.type === "image" || e.type === "chart" || e.type === "shape") && a(e, {
				...t,
				path: [...t.path, n]
			});
		});
	}, l = (e, t, n, r = []) => {
		e.forEach((e, i) => {
			let a = [...r, i];
			e.type === "paragraph" ? c(e, {
				story: t,
				storyInstance: n,
				path: a
			}) : e.type === "table" ? o(e, t, n, a) : e.type === "sectionBreak" && (s(e.headers, "header", `section:${i}`), s(e.footers, "footer", `section:${i}`));
		});
	};
	l(e.body, "body", "body"), s(e.headers, "header"), s(e.footers, "footer");
	for (let t of e.footnotes ?? []) l(t.content, "footnote", t.id);
	for (let t of e.endnotes ?? []) l(t.content, "endnote", t.id);
	let u = t ?? Cu(e, void 0, n), d = new Map(u.map((e) => [e.resourceKey, e])), f = r.map((e) => e.resourceKey).sort(), p = u.map((e) => e.resourceKey).sort();
	if (f.length !== p.length || f.some((e, t) => e !== p[t])) throw Error("Paint image descriptor membership differs from layout image metadata");
	for (let [e, t] of r.entries()) {
		let n = d.get(t.resourceKey);
		if (!n) throw Error(`Missing layout image metadata: ${t.resourceKey}`);
		i.push({
			...t,
			documentOrder: e,
			mimeType: n.mimeType,
			intrinsicSize: {
				widthPt: n.widthPt,
				heightPt: n.heightPt
			}
		});
	}
	for (let t of yu(e)) i.push({
		kind: "math",
		resourceKey: t.resourceKey
	});
	return i;
}
function kC(e, t, n) {
	return TC(OC(e, t, n));
}
//#endregion
//#region packages/docx/src/layout/production-services.ts
function AC(e, t) {
	let n = kr(t.localMetrics), r = Object.freeze(Object.fromEntries(Object.entries(t.fontFamilyCharsets).map(([e, t]) => [e.trim().toLowerCase(), t]))), i = (e) => e.trim().replace(/^(['"])(.*)\1$/, "$2"), a = (e) => i(e).toLocaleLowerCase("en-US"), o = (e) => {
		let t = e.style.trim().toLocaleLowerCase("en-US");
		return t === "normal" || t === "italic" ? t : null;
	}, s = (e) => {
		let t = e.weight.trim().toLocaleLowerCase("en-US");
		if (t === "normal") return 400;
		if (t === "bold") return 700;
		if (!/^\d+$/.test(t)) return null;
		let n = Number(t);
		return n >= 100 && n <= 900 ? n : null;
	}, c = (e) => e.flatMap((e) => {
		if (e.status !== "loaded") return [];
		let t = s(e), n = o(e);
		return t == null || n == null ? [] : [{
			family: a(e.family),
			displayFamily: i(e.family),
			weight: t,
			style: n
		}];
	}), l = new Map(c(t.embeddedFaces ?? []).map((e) => [`${e.family}:${e.weight}:${e.style}`, e])), u = (e.embeddedFonts ?? []).flatMap((e) => {
		let t = e.style === "bold" || e.style === "boldItalic" ? 700 : 400, n = e.style === "italic" || e.style === "boldItalic" ? "italic" : "normal", r = l.get(`${a(e.fontName)}:${t}:${n}`);
		return r ? [{
			requestedFamily: e.fontName,
			resolvedFamily: r.displayFamily,
			source: "embedded",
			weight: t,
			style: n
		}] : [];
	});
	for (let [e, t] of Object.entries(n)) u.push({
		requestedFamily: t.requestedFamily ?? e,
		resolvedFamily: t.family,
		source: "local",
		weight: t.weight ?? 400,
		style: t.style ?? "normal"
	});
	if (t.useGoogleFonts) {
		let n = c(t.googleFaces ?? []), r = /* @__PURE__ */ new Set();
		for (let t of uC(e)) {
			if (!t) continue;
			let e = t.toLocaleLowerCase("en-US");
			if (r.has(e)) continue;
			r.add(e);
			let i = cC[e], o = i?.loadFamily ?? t;
			if (i) for (let e of n.filter((e) => e.family === a(o))) u.push({
				requestedFamily: t,
				resolvedFamily: e.displayFamily,
				source: a(o) === a(t) ? "google" : "substitute",
				weight: e.weight,
				style: e.style
			});
		}
	}
	let d = t.measureContext, f = [...new Set([
		...Object.keys(e.fontFamilyClasses ?? {}),
		...Object.keys(e.fontFamilyPitches ?? {}),
		...sC(e),
		...e.majorFont ? [e.majorFont] : [],
		...e.minorFont ? [e.minorFont] : []
	])], p = Pr({
		fonts: gC(u, { nativeFamilyLists: Object.fromEntries(f.map((t) => [t, _o(t, e.fontFamilyClasses ?? {}, e.fontFamilyPitches ?? {})])) }),
		localMetrics: n,
		eastAsiaFontCharsets: r,
		genericFamilies: Object.fromEntries(f.map((t) => [t, Dr(t, e.fontFamilyClasses, e.fontFamilyPitches)])),
		measurer: {
			fingerprint: d ? "canvas-text-metrics-v1" : "deterministic-text-metrics-v1",
			measure(e) {
				if (!d) return {
					advancePt: [...e.text].length * e.fontSizePt * .5,
					ascentPt: e.fontSizePt * .8,
					descentPt: e.fontSizePt * .2
				};
				let t = d.font, n = d.letterSpacing, r = d.fontKerning;
				try {
					d.font = at(e.fontRoute, e.fontSizePt, e.weight, e.style), d.letterSpacing = `${e.letterSpacingPt}px`, e.kerning != null && (d.fontKerning = e.kerning ? "normal" : "none");
					let t = d.measureText(e.text), n = Number.isFinite(t.actualBoundingBoxLeft) && Number.isFinite(t.actualBoundingBoxRight), r = {
						xMinPt: n ? -t.actualBoundingBoxLeft : 0,
						xMaxPt: n ? t.actualBoundingBoxRight : t.width,
						ascentPt: t.actualBoundingBoxAscent,
						descentPt: t.actualBoundingBoxDescent
					};
					return {
						advancePt: t.width,
						ascentPt: t.fontBoundingBoxAscent ?? t.actualBoundingBoxAscent ?? 0,
						descentPt: t.fontBoundingBoxDescent ?? t.actualBoundingBoxDescent ?? 0,
						...Object.values(r).every(Number.isFinite) ? {
							inkBounds: r,
							...n ? { horizontalInkBoundsAreTight: !0 } : {}
						} : {}
					};
				} finally {
					d.font = t, d.letterSpacing = n, e.kerning != null && (d.fontKerning = r);
				}
			}
		}
	}), m = t.mathResources ?? t.mathOccurrences.map(({ display: e, source: t }) => ({
		resourceKey: Mn(t, e ? "display" : "inline"),
		widthEm: 0,
		ascentEm: 0,
		descentEm: 0,
		available: !1,
		diagnostics: [{
			code: "UNSUPPORTED_FEATURE",
			severity: "warning",
			message: "The optional DOM math engine is unavailable; using the worker-safe text fallback"
		}]
	})), h = Cu(e, (e) => {
		let n = e.numbering;
		if (!n) throw Error("Picture-bullet metadata requires numbering");
		let r = t.acquisitionInputs.numberingMarkerShapeInput(n, xo(e));
		return {
			widthPt: n.picBulletWidthPt ?? r.fontSizePt,
			heightPt: n.picBulletHeightPt ?? r.fontSizePt
		};
	}, t.acquisitionInputs), g = Object.freeze({
		text: p,
		images: xu(h),
		math: Su(m),
		verticalGlyphFingerprint: t.verticalGlyphMeasurement.fingerprint
	}), _ = t.mathOccurrences.map(({ source: e, display: t }) => Mn(e, t ? "display" : "inline")), v = m.map((e) => e.resourceKey), y = _.filter((e) => !v.includes(e)), b = v.filter((e) => !_.includes(e));
	if (y.length || b.length) throw Error(`Math metadata membership mismatch: missing [${y.join(", ")}]; extra [${b.join(", ")}]`);
	return Hu(g, t.mathDrawables ?? /* @__PURE__ */ new Map(), m.filter((e) => e.available !== !1).map((e) => e.resourceKey)), Zu(g, kC(e, h, t.acquisitionInputs)), Ru(g, t.verticalGlyphMeasurement), g;
}
//#endregion
//#region packages/docx/src/layout-runtime.ts
function jC(e, t, n, r) {
	return QS(e, t, n, r).kernel;
}
function MC(e, t = {}) {
	let n = _u(e);
	e = n.document;
	let r = t.measureContext ?? (() => {
		if (typeof document < "u") {
			let e = document.createElement("canvas").getContext("2d");
			if (e !== null) return e;
		}
		return typeof OffscreenCanvas < "u" ? new OffscreenCanvas(1, 1).getContext("2d") : null;
	})(), i = r === null ? null : Object.freeze({
		get font() {
			return r.font;
		},
		set font(e) {
			r.font = e;
		},
		get letterSpacing() {
			return r.letterSpacing;
		},
		set letterSpacing(e) {
			r.letterSpacing = e;
		},
		get fontKerning() {
			return r.fontKerning;
		},
		set fontKerning(e) {
			r.fontKerning = e;
		},
		measureText(e) {
			return r.measureText(e);
		}
	}), a = r?.canvas, o = a?.ownerDocument?.defaultView?.HTMLCanvasElement, s = r !== null && (typeof o == "function" && a instanceof o || typeof HTMLCanvasElement < "u" && a instanceof HTMLCanvasElement), c = Object.freeze({
		fingerprint: r === null ? "vertical-glyph-measurement:deterministic-v1" : s ? "vertical-glyph-measurement:dom-vert-probe-v2" : "vertical-glyph-measurement:no-dom-vert-probe-v1",
		measureRunInkExtra(e) {
			if (r === null) throw Error("Vertical glyph measurement requires a concrete text context");
			return Ie(r, () => XS(r, e));
		},
		planRun(e) {
			if (r === null) throw Error("Vertical glyph planning requires a concrete text context");
			return Ie(r, () => {
				let t = r.font, n = r.fontKerning;
				r.font = e.font, r.fontKerning = e.fontKerning;
				try {
					return JS(r, e.text, e.fontSizePt, e.letterSpacingPt, e.charScale, e.growTrRotateInk, (e) => ne(r, e), e.writingMode);
				} finally {
					r.font = t, r.fontKerning = n;
				}
			});
		}
	}), l = kr(t.localMetrics), u = AC(e, {
		...t,
		localMetrics: l,
		measureContext: i,
		verticalGlyphMeasurement: c,
		fontFamilyCharsets: n.fontFamilyCharsets,
		mathOccurrences: n.mathOccurrences,
		acquisitionInputs: n.bodyModelGateway.acquisitionInputs
	});
	return Iu(u, jC(e, i, l, n.bodyModelGateway)), u;
}
//#endregion
//#region packages/docx/src/renderer.ts
function NC(e) {
	return (Array.isArray(e) ? vu(e) : yu(e)).length > 0;
}
async function PC(e, t) {
	if (Array.isArray(e)) throw TypeError("prepareMathRuns requires a document model so every story has an explicit structural source");
	return bb(_u(e).mathOccurrences, t);
}
function FC(e) {
	Tp(e);
}
function IC(e, t, n, r) {
	let i = r.layoutServices ?? MC(e, e.parseError == null ? { measureContext: t.getContext("2d") } : {}), a = r.defaultCurrentDateMs ?? Date.now();
	vb(i, a, () => {
		let t = _u(e);
		return {
			model: t.document,
			input: t.bodyLayoutInput
		};
	});
	let o = Qf(i, {
		currentDate: r.currentDate,
		defaultCurrentDateMs: a
	}, n), s = Tm(o.page, r.width);
	return {
		selection: o,
		paintOptions: {
			width: r.width,
			dpr: r.dpr,
			defaultTextColor: r.defaultTextColor,
			showTrackChanges: r.showTrackChanges,
			fetchImage: r.fetchImage,
			parseError: e.parseError != null,
			registry: Qu(i),
			privateResources: Uu(i),
			textRuns: r.onTextRun ? bp(o.layout, n, { scale: s }) : [],
			onTextRun: r.onTextRun
		}
	};
}
async function LC(e, t, n, r = {}) {
	let i = IC(e, t, n, r);
	return km(i.selection.layout, i.selection.page, t, i.paintOptions);
}
//#endregion
//#region packages/docx/src/bookmark-nav.ts
function RC(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.pages) for (let e of n.bookmarkStarts) e.name !== "" && !t.has(e.name) && t.set(e.name, n.pageIndex);
	return t;
}
//#endregion
//#region packages/docx/src/embedded-fonts.ts
async function zC(e, t) {
	let n = e.embeddedFonts;
	if (!n || n.length === 0) return [];
	let r = (await Promise.all(n.map(async (e) => {
		try {
			let n = await t(e.partPath);
			return {
				family: e.fontName,
				bytes: n,
				odttf: e.partPath.toLowerCase().endsWith(".odttf"),
				fontKey: e.fontKey,
				weight: BC(e.style),
				style: VC(e.style)
			};
		} catch {
			return null;
		}
	}))).filter((e) => e !== null);
	return r.length === 0 ? [] : nt(r);
}
function BC(e) {
	return e === "bold" || e === "boldItalic" ? "bold" : "normal";
}
function VC(e) {
	return e === "italic" || e === "boldItalic" ? "italic" : "normal";
}
//#endregion
//#region packages/docx/src/local-font-metrics.ts
function HC(e) {
	let t = new Set((e.embeddedFonts ?? []).map((e) => {
		let t = e.style === "bold" || e.style === "boldItalic" ? 700 : 400, n = e.style === "italic" || e.style === "boldItalic" ? "italic" : "normal";
		return `${mn(e.fontName)}:${t}:${n}`;
	})), n = [], r = /* @__PURE__ */ new Set(), i = (e) => {
		let i = e?.trim();
		if (!i) return;
		let a = mn(i);
		if (!(a === "meiryo" || i === "メイリオ")) return;
		let o = `${a}:400:normal`;
		t.has(o) || r.has(o) || (r.add(o), n.push({
			family: i,
			localNames: ["Meiryo"],
			lineHeightMultiplier: 1.3
		}));
	};
	for (let t of oC(e)) if (!(t.bold || t.italic)) for (let e of t.fontFamilies) i(e);
	return n;
}
function UC(e) {
	return vn(HC(e));
}
//#endregion
//#region packages/docx/src/document-layout.ts
function WC(e, t = MC(e), n) {
	return _b(_u(e).bodyLayoutInput, t, n);
}
//#endregion
//#region packages/docx/src/render-worker-layout.ts
function GC(e, t, n) {
	let r = Zf({
		model: e,
		services: t,
		defaultCurrentDateMs: n,
		buildLayout: (n) => WC(e, t, n)
	});
	return Object.freeze({
		model: e,
		layoutServices: t,
		layoutVariants: r.store,
		defaultCurrentDateMs: n
	});
}
//#endregion
//#region packages/docx/src/document.ts
var KC = class e {
	_document = null;
	_meta = null;
	_bookmarkPages = null;
	_mode = "main";
	_worker;
	_bridge;
	_imageCache = /* @__PURE__ */ new Map();
	_embeddedFontFaces = [];
	_googleFontFaces = [];
	_localMetricFontFaces = [];
	_fetchImage = (e, t) => this.getImage(e, t);
	constructor(e, t, n, r) {
		this._worker = e, this._mode = t, Tu(this, n), this._bridge = new j(this._worker, {
			correlate: (e) => e.id,
			toError: (e) => {
				if (e.type === "error") return Object.assign(Error(e.message), {
					name: e.errorName ?? "Error",
					...e.code === void 0 ? {} : { code: e.code },
					...e.reason === void 0 ? {} : { reason: e.reason },
					...e.outgoingColumnIndex === void 0 ? {} : { outgoingColumnIndex: e.outgoingColumnIndex },
					...e.outgoingColumnCount === void 0 ? {} : { outgoingColumnCount: e.outgoingColumnCount },
					...e.incomingColumnCount === void 0 ? {} : { incomingColumnCount: e.incomingColumnCount }
				});
			}
		});
		let i = new URL(r ?? En, location.href).href;
		this._bridge.post({
			type: "init",
			wasmUrl: i
		});
	}
	static async load(t, n = {}) {
		let r = Date.now(), i = n.mode ?? "main";
		if (i === "worker" && (typeof Worker > "u" || typeof OffscreenCanvas > "u")) throw Error("mode: 'worker' requires Worker and OffscreenCanvas support");
		let a;
		if (typeof t == "string") {
			let e = await fetch(t);
			if (!e.ok) throw Error(`Failed to fetch: ${e.status} ${e.statusText}`);
			a = await e.arrayBuffer();
		} else a = t;
		a = m(await z(a, n.password));
		let o = new e(i === "worker" ? (await import("./render-worker-host-G3B-g9HJ.js")).createRenderWorker() : new Tn(), i, r, n.wasmUrl);
		try {
			await o._parse(a, n.maxZipEntryBytes, i === "worker" ? !!n.useGoogleFonts : !1, n.workerTimeoutMs), i === "worker" && o._mode === "main" && console.warn("[ooxml] mode: 'worker' fell back to main-thread rendering because this document requires DOM OpenType vertical glyph selection."), n.math && o._mode === "worker" && console.warn("[ooxml] the math engine is unavailable in mode: 'worker'; equations will be skipped. Use mode: 'main' for documents with equations."), o._mode === "main" && n.useGoogleFonts && o._document && (o._googleFontFaces = await u(uC(o._document), cC)), o._mode === "main" && o._document?.embeddedFonts?.length && (o._embeddedFontFaces = await zC(o._document, (e) => o.getFontBytes(e)));
			let e;
			o._mode === "main" && o._document && (e = await UC(o._document), o._localMetricFontFaces = e.faces);
			let t;
			if (o._mode === "main" && n.math && o._document && NC(o._document) && (t = await PC(o._document, n.math)), o._mode === "main" && o._document) {
				let r = Eu(o);
				r.services = MC(o._document, {
					localMetrics: e?.metrics,
					useGoogleFonts: !!n.useGoogleFonts,
					embeddedFaces: o._embeddedFontFaces,
					googleFaces: o._googleFontFaces,
					mathResources: t?.records,
					mathDrawables: t?.drawables
				});
				let i = r.services;
				GC(o._document, i, r.defaultCurrentDateMs).layoutVariants.defaultLayout;
			}
			return o;
		} catch (e) {
			throw o.destroy(), e;
		}
	}
	async _parse(e, t, n = !1, r) {
		let i = await this._bridge.request((r) => this._mode === "worker" ? {
			type: "parse",
			id: r,
			data: e,
			maxZipEntryBytes: t,
			useGoogleFonts: n,
			defaultCurrentDateMs: Eu(this).defaultCurrentDateMs
		} : {
			type: "parse",
			id: r,
			data: e,
			maxZipEntryBytes: t
		}, [e], { timeoutMs: r });
		if (this._mode === "worker") i.type === "mainThreadVerticalFallback" ? (this._document = du(JSON.parse(new TextDecoder().decode(new Uint8Array(i.documentJson)))).document, this._meta = null, this._mode = "main") : this._meta = i.meta;
		else {
			let { documentJson: e } = i;
			this._document = du(JSON.parse(new TextDecoder().decode(new Uint8Array(e)))).document;
		}
	}
	destroy() {
		this._bridge.terminate(), this._document = null, this._meta = null, Eu(this).services = null, this._bookmarkPages = null, this._imageCache.clear(), this._embeddedFontFaces.length > 0 && (rt(this._embeddedFontFaces), this._embeddedFontFaces = []), this._googleFontFaces.length > 0 && (M(this._googleFontFaces), this._googleFontFaces = []), this._localMetricFontFaces.length > 0 && (yn(this._localMetricFontFaces), this._localMetricFontFaces = []), ae(this._fetchImage), FC(this._fetchImage), ve(this._fetchImage);
	}
	async getImage(e, t) {
		let n = this._imageCache.get(e);
		if (n) return n;
		let r = this._bridge.request((t) => ({
			type: "extractImage",
			id: t,
			path: e
		})).then((e) => {
			let n = e.bytes;
			return new Blob([n], { type: t });
		});
		return this._imageCache.set(e, r), r;
	}
	async getFontBytes(e) {
		let t = (await this._bridge.request((t) => ({
			type: "extractImage",
			id: t,
			path: e
		}))).bytes;
		return new Uint8Array(t);
	}
	async toMarkdown() {
		return (await this._bridge.request((e) => ({
			type: "toMarkdown",
			id: e
		}))).markdown;
	}
	get pageCount() {
		return this._meta ? this._meta.pageCount : this._document ? this._getLayout()?.pages.length ?? 0 : 0;
	}
	get mode() {
		return this._mode;
	}
	get document() {
		if (this._meta && !this._document) throw Error("the raw document model stays in the worker in mode: 'worker'; use mode: 'main' if you need direct model access");
		if (!this._document) throw Error("Document not loaded");
		return this._document;
	}
	get comments() {
		return this._meta?.comments ?? this._document?.comments ?? [];
	}
	get footnotes() {
		return this._meta?.footnotes ?? this._document?.footnotes ?? [];
	}
	get endnotes() {
		return this._meta?.endnotes ?? this._document?.endnotes ?? [];
	}
	_getLayout() {
		if (!this._document) return null;
		let e = Eu(this).services;
		if (!e) throw Error("Document layout services are not initialized");
		let t = Vu(e);
		if (!t) throw Error("Document layout variant store is not initialized");
		return t.defaultLayout;
	}
	_getBookmarkPages() {
		if (this._bookmarkPages) return this._bookmarkPages;
		if (this._meta) return this._bookmarkPages = new Map(this._meta.bookmarkPages), this._bookmarkPages;
		let e = this._getLayout();
		return e ? (this._bookmarkPages = RC(e), this._bookmarkPages) : null;
	}
	getBookmarkPage(e) {
		return this._getBookmarkPages()?.get(e);
	}
	pageSize(e) {
		if (this._meta) {
			let t = this._meta.pageSizes, n = t[Math.max(0, Math.min(e, t.length - 1))];
			return n ? {
				widthPt: n.widthPt,
				heightPt: n.heightPt
			} : {
				widthPt: 0,
				heightPt: 0
			};
		}
		if (!this._document) return {
			widthPt: 0,
			heightPt: 0
		};
		let t = this._getLayout();
		if (!t || t.pages.length === 0) return {
			widthPt: 0,
			heightPt: 0
		};
		let n = Math.max(0, Math.min(e, t.pages.length - 1)), r = t.pages[n].geometry;
		return {
			widthPt: r.widthPt,
			heightPt: r.heightPt
		};
	}
	renderPage(e, t, n = {}) {
		if (this._mode === "worker") throw Error("renderPage(canvas) is unavailable in mode: 'worker'; use renderPageToBitmap() and paint it via an ImageBitmapRenderingContext");
		if (!this._document) throw Error("Document not loaded");
		return LC(this._document, e, t, {
			...n,
			fetchImage: this._fetchImage,
			layoutServices: Eu(this).services ?? void 0,
			defaultCurrentDateMs: Eu(this).defaultCurrentDateMs
		});
	}
	async renderPageToBitmap(e, t = {}) {
		let { onTextRun: n, ...r } = t, i = {
			...r,
			dpr: r.dpr ?? h()
		};
		if (this._mode === "worker") {
			let t = await this._bridge.request((t) => ({
				type: "renderPage",
				id: t,
				pageIndex: e,
				opts: i
			}));
			if (n) for (let e of t.runs) n(e);
			return t.bitmap;
		}
		let a = new OffscreenCanvas(1, 1);
		return await this.renderPage(a, e, {
			...i,
			onTextRun: n
		}), a.transferToImageBitmap();
	}
	async collectPageRuns(e, t = {}) {
		let n = {
			...t,
			dpr: t.dpr ?? h()
		};
		if (this._mode === "worker") return (await this._bridge.request((t) => ({
			type: "collectRuns",
			id: t,
			pageIndex: e,
			opts: n
		}))).runs;
		let r = Eu(this), i = r.services;
		if (!i) throw Error("Document layout services are not initialized");
		return xp(i, e, {
			currentDate: n.currentDate,
			defaultCurrentDateMs: r.defaultCurrentDateMs,
			width: n.width
		});
	}
};
//#endregion
//#region packages/docx/src/tate-chu-yoko-overlay.ts
function qC(e, t) {
	if (!e.eastAsianVert) return 1;
	let n = t(e.text);
	return !(n > 0) || e.w >= n ? 1 : e.w / n;
}
//#endregion
//#region packages/docx/src/text-layer.ts
function JC(e, t, n, r, i, a) {
	e.innerHTML = "";
	for (let o of t) {
		let t = document.createElement("span");
		t.textContent = o.text;
		let s = o.transform ?? "";
		if (a && o.eastAsianVert) {
			let e = qC(o, a(o.font));
			e !== 1 && (s = `${s ? `${s} ` : ""}scaleX(${e})`);
		}
		let c = s ? `transform:${s};transform-origin:top left;` : "", l = i ? o.hyperlink : void 0, u = l ? "pointer" : "text", d = o.letterSpacingPx === void 0 ? "0" : `${o.letterSpacingPx}px`;
		t.style.cssText = `position:absolute;left:${Xe(o.x, n)};top:${Xe(o.y, r)};font:${o.font};line-height:${o.h}px;letter-spacing:${d};` + c + `white-space:pre;color:transparent;cursor:${u};pointer-events:all;`, l && i && (t.title = l.kind === "external" ? l.url : l.ref, t.addEventListener("click", () => i(l))), e.appendChild(t);
	}
}
function YC(e, t, n, r, i, a, o = {}) {
	e.innerHTML = "";
	let s = o.match ?? "rgba(255, 214, 0, 0.42)", c = o.active ?? "rgba(255, 140, 0, 0.55)";
	for (let o of n) {
		let n = o.active ? c : s;
		for (let s of o.slices) {
			let o = t[s.runIndex];
			if (!o) continue;
			let c = a(o.font), l = Ge(o.text, s.start, s.end, c), u = o.letterSpacingPx ?? 0, d = Math.max(0, Math.min(s.start, o.text.length)), f = Math.max(d, Math.min(s.end, o.text.length)), p = [...o.text.slice(0, d)].length, m = [...o.text.slice(d, f)].length, h = l.x + p * u, g = l.width + Math.max(0, m - 1) * u, _ = qC(o, c), v = h * _, y = g * _;
			if (y <= 0) continue;
			let b = document.createElement("div"), x = o.transform ? `transform:${o.transform};transform-origin:top left;` : "";
			b.style.cssText = `position:absolute;left:${Xe(o.x + v, r)};top:${Xe(o.y, i)};width:${Xe(y, r)};height:${Xe(o.h, i)};` + x + `background:${n};pointer-events:none;`, e.appendChild(b);
		}
	}
}
//#endregion
//#region packages/docx/src/find.ts
var XC = class {
	_pageRuns = /* @__PURE__ */ new Map();
	_matches = [];
	_active = -1;
	constructor(e, t) {
		this._pageCount = e, this._collectPageRuns = t;
	}
	invalidate() {
		this._pageRuns.clear(), this._matches = [], this._active = -1;
	}
	pageRuns(e) {
		return this._pageRuns.get(e);
	}
	setPageRuns(e, t) {
		this._pageRuns.set(e, t);
	}
	_matchAt(e) {
		return this._matches[e];
	}
	pageHighlights(e) {
		let t = [];
		for (let n = 0; n < this._matches.length; n++) {
			let r = this._matches[n];
			r.page === e && t.push({
				slices: r.slices,
				active: n === this._active
			});
		}
		return t;
	}
	activePage() {
		let e = this._matchAt(this._active);
		return e ? e.page : null;
	}
	matches() {
		return this._matches.map((e, t) => ({
			matchIndex: t,
			text: e.text,
			location: { page: e.page }
		}));
	}
	async find(e, t = {}) {
		if (this._matches = [], this._active = -1, e.length === 0) return [];
		let n = this._pageCount();
		for (let r = 0; r < n; r++) {
			let n = await this._ensurePageRuns(r), i = De(n);
			for (let a of me(i, e, t)) {
				let e = a.slices.map((e) => n[e.runIndex].text.slice(e.start, e.end)).join("");
				this._matches.push({
					page: r,
					text: e,
					slices: a.slices
				});
			}
		}
		return this.matches();
	}
	next() {
		return this._active = ke(this._active, this._matches.length), this._activePublic();
	}
	prev() {
		return this._active = xe(this._active, this._matches.length), this._activePublic();
	}
	_activePublic() {
		let e = this._matchAt(this._active);
		return e ? {
			matchIndex: this._active,
			text: e.text,
			location: { page: e.page }
		} : null;
	}
	async _ensurePageRuns(e) {
		let t = this._pageRuns.get(e);
		if (t) return t;
		let n = await this._collectPageRuns(e);
		return this._pageRuns.set(e, n), n;
	}
}, ZC = class {
	_doc = null;
	_currentPage = 0;
	_scale = null;
	_canvas;
	_wrapper;
	_originalParent = null;
	_originalNextSibling = null;
	_originalDisplay = "";
	_textLayer = null;
	_highlightLayer = null;
	_find;
	_measureCtx = null;
	_opts;
	_mode;
	_bitmapCtx = null;
	_destroyed = !1;
	_loadGen = 0;
	constructor(e, t = {}) {
		this._canvas = e, this._opts = t, this._mode = t.mode ?? "main";
		let n = e.parentElement;
		this._originalParent = n, this._originalNextSibling = e.nextSibling, this._originalDisplay = e.style.display, this._wrapper = document.createElement("div"), this._wrapper.style.cssText = "position:relative;display:inline-block;vertical-align:top;", e.style.display || (e.style.display = "block"), n && n.insertBefore(this._wrapper, e), this._wrapper.appendChild(e), this._mode === "worker" && (this._bitmapCtx = e.getContext("bitmaprenderer")), t.enableTextSelection && (this._textLayer = document.createElement("div"), this._textLayer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;user-select:text;-webkit-user-select:text;", this._wrapper.appendChild(this._textLayer)), this._highlightLayer = document.createElement("div"), this._highlightLayer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;", this._wrapper.appendChild(this._highlightLayer), this._find = new XC(() => this.pageCount, (e) => this._collectPageRuns(e));
	}
	async load(e) {
		let t = ++this._loadGen, n = this._doc;
		try {
			let r = await KC.load(e, {
				useGoogleFonts: this._opts.useGoogleFonts,
				maxZipEntryBytes: this._opts.maxZipEntryBytes,
				workerTimeoutMs: this._opts.workerTimeoutMs,
				wasmUrl: this._opts.wasmUrl,
				math: this._opts.math,
				mode: this._mode
			});
			if (t !== this._loadGen) {
				r.destroy();
				return;
			}
			this._doc = r, n?.destroy(), this._currentPage = 0, this._find.invalidate(), await this._render();
		} catch (e) {
			if (t !== this._loadGen) return;
			let n = e instanceof Error ? e : Error(String(e));
			if (this._opts.onError) {
				this._opts.onError(n);
				return;
			}
			throw n;
		}
	}
	get pageCount() {
		return this._doc?.pageCount ?? 0;
	}
	get currentPage() {
		return this._currentPage;
	}
	get canvasElement() {
		return this._canvas;
	}
	async goToPage(e) {
		this._doc && (this._currentPage = Math.max(0, Math.min(e, this.pageCount - 1)), await this._render());
	}
	async nextPage() {
		await this.goToPage(this._currentPage + 1);
	}
	async prevPage() {
		await this.goToPage(this._currentPage - 1);
	}
	_naturalWidthPx() {
		return !this._doc || this._doc.pageCount === 0 ? 0 : this._doc.pageSize(this._currentPage).widthPt * b;
	}
	_renderWidth() {
		if (this._scale === null) return this._opts.width;
		let e = this._naturalWidthPx();
		return e <= 0 ? this._opts.width : Math.round(e * this._scale);
	}
	getScale() {
		if (this._scale !== null) return this._scale;
		let e = this._naturalWidthPx();
		return e <= 0 ? 1 : this._opts.width && this._opts.width > 0 ? this._opts.width / e : 1;
	}
	_zoomMin() {
		return this._opts.zoomMin ?? .1;
	}
	_zoomMax() {
		return this._opts.zoomMax ?? 4;
	}
	async setScale(e) {
		let t = je(e, this._zoomMin(), this._zoomMax()), n = t !== this.getScale();
		this._scale = t, await this._render(), n && this._opts.onScaleChange?.(t);
	}
	async zoomIn() {
		await this.setScale(ue(this.getScale()));
	}
	async zoomOut() {
		await this.setScale(we(this.getScale()));
	}
	async fitWidth() {
		await this._fit("width");
	}
	async fitPage() {
		await this._fit("page");
	}
	async _fit(e) {
		if (!this._doc || this._doc.pageCount === 0) return;
		let t = this._doc.pageSize(this._currentPage), n = this._fitContainer();
		if (!n) return;
		let r = ce({
			contentWidth: t.widthPt * b,
			contentHeight: t.heightPt * b,
			containerWidth: n.clientWidth,
			containerHeight: n.clientHeight
		}, e);
		r <= 0 || await this.setScale(r);
	}
	_fitContainer() {
		return this._opts.container ?? this._wrapper.parentElement ?? null;
	}
	async findText(e, t = {}) {
		if (!this._doc) return [];
		let n = await this._find.find(e, t);
		return this._redrawHighlights(), n;
	}
	async findNext() {
		return this._activateMatch(this._find.next());
	}
	async findPrev() {
		return this._activateMatch(this._find.prev());
	}
	clearFind() {
		this._find.invalidate(), this._redrawHighlights();
	}
	async _activateMatch(e) {
		return e ? (e.location.page === this._currentPage ? this._redrawHighlights() : await this.goToPage(e.location.page), e) : (this._redrawHighlights(), null);
	}
	_redrawHighlights() {
		let e = this._find.pageRuns(this._currentPage) ?? [];
		this._buildHighlightLayer(e);
	}
	destroy() {
		if (this._destroyed = !0, this._loadGen++, this._doc?.destroy(), this._doc = null, this._find.invalidate(), this._originalParent) {
			let e = this._originalNextSibling && this._originalNextSibling.parentNode === this._originalParent ? this._originalNextSibling : null;
			this._originalParent.insertBefore(this._canvas, e);
		} else this._canvas.parentNode && this._canvas.parentNode.removeChild(this._canvas);
		this._canvas.style.display = this._originalDisplay, this._wrapper.remove();
	}
	async _render() {
		try {
			await this._renderPage();
		} catch (e) {
			this._reportRenderError(e);
		}
	}
	_reportRenderError(e) {
		if (this._destroyed) return;
		let t = e instanceof Error ? e : Error(String(e));
		this._opts.onError ? this._opts.onError(t) : console.error("[ooxml] DocxViewer render failed:", t);
	}
	async _renderPage() {
		if (!this._doc) return;
		let e = this._mode === "worker", t = this._renderWidth(), n = [], r = (e) => n.push(e);
		if (e) {
			let e = this._opts.dpr ?? (typeof window < "u" && window.devicePixelRatio || 1), n = await this._doc.renderPageToBitmap(this._currentPage, {
				width: t,
				dpr: this._opts.dpr,
				defaultTextColor: this._opts.defaultTextColor,
				showTrackChanges: this._opts.showTrackChanges,
				currentDate: this._opts.currentDate,
				onTextRun: r
			});
			this._canvas.width = n.width, this._canvas.height = n.height, this._canvas.style.width = `${Math.round(n.width / e)}px`, this._canvas.style.height = `${Math.round(n.height / e)}px`, this._bitmapCtx?.transferFromImageBitmap(n);
		} else await this._doc.renderPage(this._canvas, this._currentPage, {
			...this._opts,
			width: t,
			onTextRun: r
		});
		this._textLayer && this._buildTextLayer(this._textLayer, n), this._find.setPageRuns(this._currentPage, n), this._buildHighlightLayer(n), this._opts.onPageChange?.(this._currentPage, this.pageCount);
	}
	_buildHighlightLayer(e) {
		let t = this._highlightLayer;
		if (!t) return;
		let { width: n, height: r } = this._canvasCssPx();
		YC(t, e, this._find.pageHighlights(this._currentPage), n, r, (e) => this._measureForFont(e));
	}
	_canvasCssPx() {
		return {
			width: parseFloat(this._canvas.style.width) || this._canvas.width,
			height: parseFloat(this._canvas.style.height) || this._canvas.height
		};
	}
	_measureForFont(e) {
		this._measureCtx ||= document.createElement("canvas").getContext("2d");
		let t = this._measureCtx;
		return t ? (t.font = e, (e) => t.measureText(e).width) : (e) => e.length;
	}
	async _collectPageRuns(e) {
		return this._doc ? this._doc.collectPageRuns(e, {
			width: this._renderWidth(),
			dpr: this._opts.dpr,
			defaultTextColor: this._opts.defaultTextColor,
			showTrackChanges: this._opts.showTrackChanges,
			currentDate: this._opts.currentDate
		}) : [];
	}
	_buildTextLayer(e, t) {
		let { width: n, height: r } = this._canvasCssPx();
		JC(e, t, n, r, this._hyperlinkHandler(), (e) => this._measureForFont(e));
	}
	_hyperlinkHandler() {
		return this._opts.enableHyperlinks === !1 ? void 0 : this._opts.onHyperlinkClick || ((e) => {
			if (e.kind === "external") {
				_e(e.url);
				return;
			}
			let t = this._doc?.getBookmarkPage(e.ref);
			t !== void 0 && this.goToPage(t);
		});
	}
}, QC = 150, $C = "0 1px 3px rgba(0,0,0,0.2)", ew = class {
	_doc = null;
	_injected;
	_opts;
	_container;
	_wrapper;
	_scrollHost;
	_spacer;
	_mode;
	_scale = 1;
	_scaleEstablished = !1;
	_pendingScale = null;
	_slots = /* @__PURE__ */ new Map();
	_free = [];
	_heights = [];
	_lastRange = null;
	_lastTopIndex = -1;
	_scrollListener = null;
	_destroyed = !1;
	_measureCtx;
	_loadGen = 0;
	_bitmapInFlight = /* @__PURE__ */ new Set();
	_renderEpoch = 0;
	_settleTimer = null;
	_wheelListener = null;
	_pendingZoomAnchor = null;
	_resizeObserver = null;
	_prevBase = 0;
	_lastFitWidth = 0;
	_pageShadow;
	constructor(e, t = {}) {
		if (e.tagName === "CANVAS") throw Error("DocxScrollViewer takes a container element (e.g. a <div>), not a <canvas> — the viewer creates and manages its own canvases. Pass a block container; for the single-page canvas API use DocxViewer.");
		if (this._container = e, this._opts = t, this._pageShadow = t.pageShadow ?? $C, this._injected = !!t.document, this._injected) {
			let e = t.document;
			if (t.mode !== void 0 && t.mode !== e.mode) throw Error(`DocxScrollViewer: opts.mode='${t.mode}' conflicts with the injected engine's mode='${e.mode}'. Omit opts.mode when injecting an engine — the engine owns its render mode.`);
			this._doc = e, this._mode = e.mode;
		} else this._mode = t.mode ?? "main";
		this._wrapper = document.createElement("div"), this._wrapper.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;", this._scrollHost = document.createElement("div"), this._scrollHost.style.cssText = "position:absolute;inset:0;overflow:auto;", t.background && (this._scrollHost.style.background = t.background), this._spacer = document.createElement("div"), this._spacer.style.cssText = "position:absolute;top:0;left:0;width:1px;height:0;pointer-events:none;", this._scrollHost.appendChild(this._spacer), this._wrapper.appendChild(this._scrollHost), this._container.appendChild(this._wrapper), this._scrollListener = () => this._onScroll(), this._scrollHost.addEventListener("scroll", this._scrollListener), this._opts.enableZoom !== !1 && (this._wheelListener = (e) => {
			if (!(e.ctrlKey || e.metaKey) || (e.preventDefault(), e.deltaY === 0)) return;
			let t = this._scrollHost.getBoundingClientRect(), n = e.clientX - t.left, r = e.clientY - t.top;
			this._pendingZoomAnchor = Number.isFinite(n) && Number.isFinite(r) ? {
				x: n,
				y: r
			} : null, this.setScale(pe(this._scale, e.deltaY));
		}, this._scrollHost.addEventListener("wheel", this._wheelListener, { passive: !1 })), typeof ResizeObserver < "u" && (this._resizeObserver = new ResizeObserver(() => this._onResize()), this._resizeObserver.observe(this._container)), this._injected && this.relayout();
	}
	async load(e) {
		if (this._injected) throw Error("DocxScrollViewer.load() is unsupported when an engine is injected via opts.document; the injected engine is already loaded.");
		let t = ++this._loadGen, n = this._doc;
		try {
			let r = await KC.load(e, {
				useGoogleFonts: this._opts.useGoogleFonts,
				maxZipEntryBytes: this._opts.maxZipEntryBytes,
				workerTimeoutMs: this._opts.workerTimeoutMs,
				wasmUrl: this._opts.wasmUrl,
				math: this._opts.math,
				mode: this._mode
			});
			if (t !== this._loadGen) {
				r.destroy();
				return;
			}
			if (this._doc = r, n?.destroy(), n) {
				for (let [e, t] of [...this._slots]) this._recycleSlot(e, t);
				this._lastTopIndex = -1;
			}
			this.relayout();
		} catch (e) {
			if (t !== this._loadGen) return;
			let n = e instanceof Error ? e : Error(String(e));
			if (this._opts.onError) {
				this._opts.onError(n);
				return;
			}
			throw n;
		}
	}
	get pageCount() {
		return this._doc?.pageCount ?? 0;
	}
	_pageWidthPx(e) {
		return this._doc.pageSize(e).widthPt * b * this._scale;
	}
	_pageHeightPx(e) {
		return this._doc.pageSize(e).heightPt * b * this._scale;
	}
	_fitWidthPx() {
		if (this._opts.width && this._opts.width > 0) return this._opts.width;
		let e = this._container.clientWidth || this._scrollHost.clientWidth;
		if (e <= 0) return 0;
		let { left: t, right: n } = this._padH(), r = e - t - n;
		return r > 0 ? r : 0;
	}
	_baseScale() {
		if (!this._doc || this._doc.pageCount === 0) return 0;
		let e = this._fitWidthPx();
		if (e <= 0) return 0;
		let t = this._doc.pageSize(0).widthPt;
		return t <= 0 ? 0 : e / (t * b);
	}
	relayout() {
		if (this._doc) {
			if (!this._scaleEstablished) {
				let e = this._baseScale();
				if (e > 0) {
					if (this._scale = e, this._prevBase = e, this._lastFitWidth = this._fitWidthPx(), this._scaleEstablished = !0, this._pendingScale !== null) {
						let e = this._pendingScale;
						this._pendingScale = null, e !== this._scale && (this._scale = e, this._opts.onScaleChange?.(e));
					}
				} else return;
			}
			this._recomputeHeights(), this._syncSpacer(), this._mountVisible();
		}
	}
	_recomputeHeights() {
		let e = this._doc.pageCount, t = Array(e);
		for (let n = 0; n < e; n++) t[n] = this._pageHeightPx(n);
		this._heights = t;
	}
	_gap() {
		return this._opts.gap ?? 16;
	}
	_overscan() {
		return this._opts.overscan ?? 1;
	}
	_pad() {
		let e = this._gap();
		return {
			leading: this._opts.paddingTop ?? e,
			trailing: this._opts.paddingBottom ?? e
		};
	}
	_padH() {
		let e = this._gap();
		return {
			left: this._opts.paddingLeft ?? e,
			right: this._opts.paddingRight ?? e
		};
	}
	_pageIndexAtOffset(e, t) {
		let { offsets: n } = e, r = 0, i = n.length - 1, a = 0;
		for (; r <= i;) {
			let e = r + i >> 1;
			n[e] <= t ? (a = e, r = e + 1) : i = e - 1;
		}
		return a;
	}
	_range() {
		return Je(this._heights, this._gap(), this._scrollHost.scrollTop, this._scrollHost.clientHeight, this._overscan(), this._pad());
	}
	_syncSpacer() {
		let e = this._range();
		this._lastRange = e, this._spacer.style.height = `${e.totalHeight}px`, this._syncSpacerWidth();
	}
	_syncSpacerWidth() {
		let { left: e, right: t } = this._padH(), n = 0;
		for (let e = 0; e < this._heights.length; e++) {
			let t = this._pageWidthPx(e);
			t > n && (n = t);
		}
		this._spacer.style.width = `${n + e + t}px`;
	}
	_onScroll() {
		!this._doc || !this._scaleEstablished || this._mountVisible();
	}
	_mountVisible() {
		if (!this._doc || this._doc.pageCount === 0) return;
		let e = this._range();
		this._lastRange = e;
		for (let [t, n] of [...this._slots]) (t < e.start || t > e.end) && this._recycleSlot(t, n);
		for (let t = e.start; t <= e.end; t++) if (this._slots.has(t)) this._positionSlot(this._slots.get(t), t, e);
		else {
			let n = this._acquireSlot();
			this._positionSlot(n, t, e), this._slots.set(t, n), this._renderSlot(t, n);
		}
		e.topIndex !== this._lastTopIndex && (this._lastTopIndex = e.topIndex, this._opts.onVisiblePageChange?.(e.topIndex, this._doc.pageCount));
	}
	_applyPageShadow(e) {
		this._pageShadow !== !1 && (e.style.boxShadow = this._pageShadow);
	}
	_acquireSlot() {
		let e = this._free.pop();
		if (e) return this._scrollHost.appendChild(e.wrapper), e;
		let t = document.createElement("div");
		t.style.cssText = "position:absolute;";
		let n = document.createElement("canvas");
		n.style.cssText = "display:block;background:#fff;", this._applyPageShadow(n), t.appendChild(n);
		let r = null;
		return this._opts.enableTextSelection && (r = document.createElement("div"), r.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;user-select:text;-webkit-user-select:text;", t.appendChild(r)), this._scrollHost.appendChild(t), {
			wrapper: t,
			canvas: n,
			textLayer: r,
			renderedPage: -1,
			renderedScale: -1,
			bitmap: null,
			bitmapCtx: null
		};
	}
	_recycleSlot(e, t) {
		this._slots.delete(e), t.bitmap &&= (t.bitmap.close(), null), t.textLayer && (t.textLayer.innerHTML = "", t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = ""), t.renderedPage = -1, t.renderedScale = -1, t.wrapper.remove(), this._free.push(t);
	}
	_positionSlot(e, t, n) {
		e.wrapper.style.top = `${n.offsets[t]}px`;
		let r = this._pageWidthPx(t), i = this._pageHeightPx(t);
		e.wrapper.style.width = `${r}px`, e.wrapper.style.height = `${i}px`;
		let { left: a } = this._padH(), o = this._scrollHost.clientWidth;
		e.wrapper.style.left = `${Math.max(a, (o - r) / 2)}px`;
	}
	_dpr() {
		return this._opts.dpr ?? (typeof window < "u" && window.devicePixelRatio || 1);
	}
	_renderSlot(e, t) {
		if (!this._doc || t.renderedPage === e) return;
		t.renderedPage = e;
		let n = this._dpr(), r = this._pageWidthPx(e), i = this._renderEpoch, a = this._scale;
		if (this._mode === "worker") {
			this._renderSlotBitmap(e, t, r, n, a);
			return;
		}
		let o = [], s = !!this._opts.enableTextSelection && !!t.textLayer, c = s ? (e) => o.push(e) : void 0;
		this._doc.renderPage(t.canvas, e, {
			width: r,
			dpr: n,
			defaultTextColor: this._opts.defaultTextColor,
			showTrackChanges: this._opts.showTrackChanges,
			onTextRun: c
		}).then(() => {
			if (!(i !== this._renderEpoch || this._slots.get(e) !== t || t.renderedPage !== e) && (t.renderedScale = a, s && t.textLayer)) {
				let { width: e, height: n } = this._canvasCssPx(t.canvas);
				JC(t.textLayer, o, e, n, this._hyperlinkHandler(), (e) => this._measureForFont(e));
			}
		}).catch((e) => {
			this._reportRenderError(e);
		});
	}
	_hyperlinkHandler() {
		return this._opts.enableHyperlinks === !1 ? void 0 : this._opts.onHyperlinkClick || ((e) => {
			if (e.kind === "external") {
				_e(e.url);
				return;
			}
			let t = this._doc?.getBookmarkPage(e.ref);
			t !== void 0 && this.scrollToPage(t);
		});
	}
	_measureForFont(e) {
		this._measureCtx === void 0 && (this._measureCtx = document.createElement("canvas").getContext("2d"));
		let t = this._measureCtx;
		return t ? (t.font = e, (e) => t.measureText(e).width) : (e) => e.length;
	}
	_canvasCssPx(e) {
		return {
			width: parseFloat(e.style.width) || e.width,
			height: parseFloat(e.style.height) || e.height
		};
	}
	_reportRenderError(e) {
		if (this._destroyed) return;
		let t = e instanceof Error ? e : Error(String(e));
		this._opts.onError ? this._opts.onError(t) : console.error("[ooxml] DocxScrollViewer render failed:", t);
	}
	async _renderSlotBitmap(e, t, n, r, i) {
		if (this._bitmapInFlight.has(e) || this._slots.get(e) !== t) return;
		let a = this._renderEpoch;
		this._bitmapInFlight.add(e);
		let o = !1;
		t.bitmapCtx ||= t.canvas.getContext("bitmaprenderer");
		let s = !!this._opts.enableTextSelection && !!t.textLayer, c = [];
		try {
			let l = await this._doc.renderPageToBitmap(e, {
				width: n,
				dpr: r,
				defaultTextColor: this._opts.defaultTextColor,
				showTrackChanges: this._opts.showTrackChanges,
				onTextRun: s ? (e) => c.push(e) : void 0
			});
			if (a !== this._renderEpoch || this._slots.get(e) !== t || t.renderedPage !== e) {
				l.close();
				return;
			}
			if (t.bitmap && t.bitmap.close(), t.bitmap = l, t.canvas.width = l.width, t.canvas.height = l.height, t.canvas.style.width = `${Math.round(l.width / r)}px`, t.canvas.style.height = `${Math.round(l.height / r)}px`, t.bitmapCtx?.transferFromImageBitmap(l), t.bitmap = null, t.renderedScale = i, t.textLayer && (t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = "", s)) {
				let { width: e, height: n } = this._canvasCssPx(t.canvas);
				JC(t.textLayer, c, e, n, this._hyperlinkHandler(), (e) => this._measureForFont(e));
			}
			o = !0;
		} catch (e) {
			this._reportRenderError(e);
		} finally {
			this._bitmapInFlight.delete(e);
			let n = this._slots.get(e);
			!o && n && (n !== t || a !== this._renderEpoch) && !this._bitmapInFlight.has(e) && !this._destroyed && this._renderSlotBitmap(e, n, this._pageWidthPx(e), this._dpr(), this._scale);
		}
	}
	setScale(e) {
		let t = this._opts.zoomMin ?? .1, n = this._opts.zoomMax ?? 4, r = Math.min(n, Math.max(t, e)), i = this._pendingZoomAnchor;
		if (this._pendingZoomAnchor = null, !this._doc || this._doc.pageCount === 0 || !this._scaleEstablished) {
			this._pendingScale = r;
			return;
		}
		if (r === this._scale) return;
		let a = this._scale, o = i ? i.y : 0, s = this._range(), c = this._scrollHost.scrollTop + o, l = this._pageIndexAtOffset(s, c), u = this._heights[l] || 0, d = u > 0 ? (c - s.offsets[l]) / u : 0;
		d = Math.min(1, Math.max(0, d));
		let f = this._padH().left, p = this._scrollHost.scrollLeft || 0;
		this._renderEpoch++, this._scale = r, this._recomputeHeights();
		let m = Je(this._heights, this._gap(), 0, this._scrollHost.clientHeight, this._overscan(), this._pad());
		this._spacer.style.height = `${m.totalHeight}px`, this._syncSpacerWidth();
		let h = Math.max(0, m.totalHeight - this._scrollHost.clientHeight), g = (m.offsets[l] ?? 0) + d * (this._heights[l] || 0);
		if (this._scrollHost.scrollTop = Math.min(h, Math.max(0, g - o)), i) {
			let e = Math.max(0, (this._spacer.offsetWidth || 0) - this._scrollHost.clientWidth);
			this._scrollHost.scrollLeft = ye(p, i.x - f, a, r, { maxScroll: e });
		}
		this._previewVisible(), this._scheduleSettle(), this._opts.onScaleChange?.(r);
	}
	getScale() {
		return this._scaleEstablished ? this._scale : this._pendingScale ?? 1;
	}
	zoomIn() {
		this.setScale(ue(this.getScale()));
	}
	zoomOut() {
		this.setScale(we(this.getScale()));
	}
	fitWidth() {
		this._fit("width");
	}
	fitPage() {
		this._fit("page");
	}
	_fit(e) {
		if (!this._doc || this._doc.pageCount === 0) return;
		let t = this._doc.pageSize(0), n = ce({
			contentWidth: t.widthPt * b,
			contentHeight: t.heightPt * b,
			containerWidth: this._fitWidthPx(),
			containerHeight: this._scrollHost.clientHeight
		}, e);
		n <= 0 || this.setScale(n);
	}
	_previewVisible() {
		if (!this._doc || this._doc.pageCount === 0) return;
		let e = this._range();
		this._lastRange = e;
		for (let [t, n] of [...this._slots]) (t < e.start || t > e.end) && this._recycleSlot(t, n);
		for (let t = e.start; t <= e.end; t++) {
			let n = this._slots.get(t);
			if (n) this._previewSlot(n, t, e);
			else {
				let n = this._acquireSlot();
				this._positionSlot(n, t, e), this._slots.set(t, n), this._renderSlot(t, n);
			}
		}
		e.topIndex !== this._lastTopIndex && (this._lastTopIndex = e.topIndex, this._opts.onVisiblePageChange?.(e.topIndex, this._doc.pageCount));
	}
	_previewSlot(e, t, n) {
		if (this._positionSlot(e, t, n), e.canvas.style.width = `${this._pageWidthPx(t)}px`, e.canvas.style.height = `${this._pageHeightPx(t)}px`, e.textLayer && e.renderedScale > 0) {
			let t = this._scale / e.renderedScale;
			e.textLayer.style.transformOrigin = "0 0", e.textLayer.style.transform = `scale(${t})`;
		}
	}
	_scheduleSettle() {
		this._settleTimer !== null && clearTimeout(this._settleTimer), this._settleTimer = setTimeout(() => {
			this._settleTimer = null, this._settleRender();
		}, QC);
	}
	_settleRender() {
		if (!(this._destroyed || !this._doc || this._doc.pageCount === 0)) for (let [e, t] of [...this._slots]) t.renderedScale !== this._scale && this._settleSlot(e, t);
	}
	_settleSlot(e, t) {
		if (!this._doc) return;
		let n = this._dpr(), r = this._pageWidthPx(e), i = this._scale, a = this._renderEpoch;
		if (this._mode === "worker") {
			this._renderSlotBitmap(e, t, r, n, i);
			return;
		}
		let o = document.createElement("canvas");
		o.style.cssText = "display:block;background:#fff;", this._applyPageShadow(o);
		let s = [], c = !!this._opts.enableTextSelection && !!t.textLayer, l = c ? (e) => s.push(e) : void 0;
		this._doc.renderPage(o, e, {
			width: r,
			dpr: n,
			defaultTextColor: this._opts.defaultTextColor,
			showTrackChanges: this._opts.showTrackChanges,
			onTextRun: l
		}).then(() => {
			if (a !== this._renderEpoch || this._slots.get(e) !== t || t.renderedPage !== e) return;
			let n = t.canvas;
			if (t.wrapper.insertBefore(o, n), n.remove(), t.canvas = o, t.bitmapCtx = null, t.renderedScale = i, t.textLayer && (t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = "", c)) {
				let { width: e, height: n } = this._canvasCssPx(o);
				JC(t.textLayer, s, e, n, this._hyperlinkHandler(), (e) => this._measureForFont(e));
			}
		}).catch((e) => {
			this._reportRenderError(e);
		});
	}
	scrollToPage(e, t) {
		if (!this._doc || this._doc.pageCount === 0 || !this._scaleEstablished) return;
		let n = Math.max(0, Math.min(e, this._doc.pageCount - 1)), r = Je(this._heights, this._gap(), 0, this._scrollHost.clientHeight, this._overscan(), this._pad()), i = r.offsets[n] ?? 0, a = Math.max(0, r.totalHeight - this._scrollHost.clientHeight), o = Math.min(a, Math.max(0, i)), s = this._scrollHost;
		typeof s.scrollTo == "function" ? s.scrollTo({
			top: o,
			behavior: t?.behavior ?? "auto"
		}) : this._scrollHost.scrollTop = o, this._mountVisible();
	}
	_onResize() {
		if (!this._doc || this._doc.pageCount === 0) return;
		if (!this._scaleEstablished) {
			this.relayout();
			return;
		}
		let e = this._baseScale();
		if (e <= 0) return;
		let t = this._fitWidthPx();
		if (t === this._lastFitWidth) {
			this._mountVisible();
			return;
		}
		this._lastFitWidth = t;
		let n = this._prevBase > 0 ? this._scale / this._prevBase : 1;
		this._prevBase = e, this.setScale(e * n), this._mountVisible();
	}
	get topVisiblePage() {
		return this._lastRange?.topIndex ?? 0;
	}
	mountedPageIndicesForTest() {
		return [...this._slots.keys()];
	}
	scaleForTest() {
		return this._scale;
	}
	baseScaleForTest() {
		return this._baseScale();
	}
	renderEpochForTest() {
		return this._renderEpoch;
	}
	resizeForTest() {
		this._onResize();
	}
	contentAtViewportYForTest(e) {
		let t = this._range(), n = this._scrollHost.scrollTop + e, r = this._pageIndexAtOffset(t, n), i = this._heights[r] || 0;
		return {
			page: r,
			frac: i > 0 ? Math.min(1, Math.max(0, (n - t.offsets[r]) / i)) : 0
		};
	}
	viewportYOfForTest(e, t) {
		return (this._range().offsets[e] ?? 0) + t * (this._heights[e] || 0) - this._scrollHost.scrollTop;
	}
	destroy() {
		this._destroyed = !0, this._loadGen++, this._scrollListener &&= (this._scrollHost.removeEventListener("scroll", this._scrollListener), null), this._wheelListener &&= (this._scrollHost.removeEventListener("wheel", this._wheelListener), null), this._resizeObserver?.disconnect(), this._resizeObserver = null, this._settleTimer !== null && (clearTimeout(this._settleTimer), this._settleTimer = null);
		for (let [e, t] of [...this._slots]) this._recycleSlot(e, t);
		this._free.length = 0, this._injected || this._doc?.destroy(), this._doc = null, this._wrapper.remove();
	}
};
//#endregion
//#region packages/docx/src/types.ts
function tw(e) {
	let t = [];
	for (let n of e.content) {
		if (n.type !== "paragraph") continue;
		let e = "";
		for (let t of n.runs) t.type === "text" && !t.noteRef && (e += t.text);
		e = e.trim(), e && t.push(e);
	}
	return t.join(" ");
}
//#endregion
//#region src/docx.ts
var nw = /* @__PURE__ */ e({
	DocxDocument: () => KC,
	DocxScrollViewer: () => ew,
	DocxViewer: () => ZC,
	OoxmlError: () => te,
	autoResize: () => re,
	buildDocxHighlightLayer: () => YC,
	buildDocxTextLayer: () => JC,
	noteText: () => tw,
	openExternalHyperlink: () => _e
});
//#endregion
export { YC as a, ZC as i, tw as n, JC as o, ew as r, KC as s, nw as t };
