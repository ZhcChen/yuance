import { t as e } from "./chunk-DmhlhrBa.js";
import { $ as t, At as n, B as r, Bt as i, C as a, D as o, E as s, Et as c, Ft as l, G as u, H as d, Ht as f, It as p, J as m, Jt as h, K as g, L as _, Lt as v, M as y, N as b, Nt as x, P as S, Pt as C, Q as w, R as T, Rt as E, S as D, St as O, T as k, U as A, Ut as j, V as M, W as N, Y as P, Yt as F, Z as I, _ as L, _t as R, at as z, b as B, c as V, ct as H, d as U, dt as ee, f as W, ft as G, gt as te, h as ne, ht as re, i as ie, jt as K, k as ae, l as oe, lt as se, m as ce, mt as le, n as ue, nt as de, o as fe, ot as pe, p as me, pt as he, q as ge, qt as _e, r as ve, rt as ye, s as be, st as xe, t as Se, u as Ce, ut as we, v as Te, vt as Ee, w as De, wt as Oe, x as ke, xt as Ae, yt as je, zt as Me } from "./find-cursor-CaGrVs7z.js";
import { a as Ne, c as Pe, d as Fe, f as Ie, i as Le, l as Re, n as ze, o as Be, r as Ve, s as He, t as q, u as Ue } from "./highlight-rect-DZn1OD1x.js";
import { a as We, i as Ge, n as Ke, r as qe, t as Je } from "./visible-index-CyuaF_ZP.js";
import { t as Ye } from "./mathjax-BPjQ2C_j.js";
var Xe = {
	textarchdown: {
		adj: [["adj", "val 0"]],
		gd: [
			["adval", "pin 0 adj 21599999"],
			["v1", "+- 10800000 0 adval"],
			["v2", "+- 32400000 0 adval"],
			["nv1", "+- 0 0 v1"],
			["stAng", "?: nv1 v2 v1"],
			["w1", "+- 5400000 0 adval"],
			["w2", "+- 16200000 0 adval"],
			["d1", "+- adval 0 stAng"],
			["d2", "+- d1 0 21600000"],
			["v3", "+- 0 0 10800000"],
			["c2", "?: w2 d1 d2"],
			["c1", "?: v1 d2 c2"],
			["c0", "?: w1 d1 c1"],
			["swAng", "?: stAng c0 v3"],
			["wt1", "sin wd2 adj"],
			["ht1", "cos hd2 adj"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["wt2", "sin wd2 stAng"],
			["ht2", "cos hd2 stAng"],
			["dx2", "cat2 wd2 ht2 wt2"],
			["dy2", "sat2 hd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x2",
				"y2"
			], [
				"a",
				"wd2",
				"hd2",
				"stAng",
				"swAng"
			]]
		}]
	},
	textarchdownpour: {
		adj: [["adj1", "val 0"], ["adj2", "val 25000"]],
		gd: [
			["adval", "pin 0 adj1 21599999"],
			["v1", "+- 10800000 0 adval"],
			["v2", "+- 32400000 0 adval"],
			["nv1", "+- 0 0 v1"],
			["stAng", "?: nv1 v2 v1"],
			["w1", "+- 5400000 0 adval"],
			["w2", "+- 16200000 0 adval"],
			["d1", "+- adval 0 stAng"],
			["d2", "+- d1 0 21600000"],
			["v3", "+- 0 0 10800000"],
			["c2", "?: w2 d1 d2"],
			["c1", "?: v1 d2 c2"],
			["c0", "?: w1 d1 c1"],
			["swAng", "?: stAng c0 v3"],
			["wt1", "sin wd2 stAng"],
			["ht1", "cos hd2 stAng"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["adval2", "pin 0 adj2 99000"],
			["ratio", "*/ adval2 1 100000"],
			["iwd2", "*/ wd2 ratio 1"],
			["ihd2", "*/ hd2 ratio 1"],
			["wt2", "sin iwd2 adval"],
			["ht2", "cos ihd2 adval"],
			["dx2", "cat2 iwd2 ht2 wt2"],
			["dy2", "sat2 ihd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["wt3", "sin iwd2 stAng"],
			["ht3", "cos ihd2 stAng"],
			["dx3", "cat2 iwd2 ht3 wt3"],
			["dy3", "sat2 ihd2 ht3 wt3"],
			["x3", "+- hc dx3 0"],
			["y3", "+- vc dy3 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x3",
				"y3"
			], [
				"a",
				"iwd2",
				"ihd2",
				"stAng",
				"swAng"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x1",
				"y1"
			], [
				"a",
				"wd2",
				"hd2",
				"stAng",
				"swAng"
			]]
		}]
	},
	textarchup: {
		adj: [["adj", "val cd2"]],
		gd: [
			["adval", "pin 0 adj 21599999"],
			["v1", "+- 10800000 0 adval"],
			["v2", "+- 32400000 0 adval"],
			["end", "?: v1 v1 v2"],
			["w1", "+- 5400000 0 adval"],
			["w2", "+- 16200000 0 adval"],
			["d1", "+- end 0 adval"],
			["d2", "+- 21600000 d1 0"],
			["c2", "?: w2 d1 d2"],
			["c1", "?: v1 d2 c2"],
			["swAng", "?: w1 d1 c1"],
			["wt1", "sin wd2 adj"],
			["ht1", "cos hd2 adj"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x1",
				"y1"
			], [
				"a",
				"wd2",
				"hd2",
				"adval",
				"swAng"
			]]
		}]
	},
	textarchuppour: {
		adj: [["adj1", "val cd2"], ["adj2", "val 50000"]],
		gd: [
			["adval", "pin 0 adj1 21599999"],
			["v1", "+- 10800000 0 adval"],
			["v2", "+- 32400000 0 adval"],
			["end", "?: v1 v1 v2"],
			["w1", "+- 5400000 0 adval"],
			["w2", "+- 16200000 0 adval"],
			["d1", "+- end 0 adval"],
			["d2", "+- 21600000 d1 0"],
			["c2", "?: w2 d1 d2"],
			["c1", "?: v1 d2 c2"],
			["swAng", "?: w1 d1 c1"],
			["wt1", "sin wd2 adval"],
			["ht1", "cos hd2 adval"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["adval2", "pin 0 adj2 99000"],
			["ratio", "*/ adval2 1 100000"],
			["iwd2", "*/ wd2 ratio 1"],
			["ihd2", "*/ hd2 ratio 1"],
			["wt2", "sin iwd2 adval"],
			["ht2", "cos ihd2 adval"],
			["dx2", "cat2 iwd2 ht2 wt2"],
			["dy2", "sat2 ihd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x1",
				"y1"
			], [
				"a",
				"wd2",
				"hd2",
				"adval",
				"swAng"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x2",
				"y2"
			], [
				"a",
				"iwd2",
				"ihd2",
				"adval",
				"swAng"
			]]
		}]
	},
	textbutton: {
		adj: [["adj", "val 10800000"]],
		gd: [
			["adval", "pin 0 adj 21599999"],
			["bot", "+- 5400000 0 adval"],
			["lef", "+- 10800000 0 adval"],
			["top", "+- 16200000 0 adval"],
			["rig", "+- 21600000 0 adval"],
			["c3", "?: top adval 0"],
			["c2", "?: lef 10800000 c3"],
			["c1", "?: bot rig c2"],
			["stAng", "?: adval c1 0"],
			["w1", "+- 21600000 0 stAng"],
			["stAngB", "?: stAng w1 0"],
			["td1", "*/ bot 2 1"],
			["td2", "*/ top 2 1"],
			["ntd2", "+- 0 0 td2"],
			["w2", "+- 0 0 10800000"],
			["c6", "?: top ntd2 w2"],
			["c5", "?: lef 10800000 c6"],
			["c4", "?: bot td1 c5"],
			["v1", "?: adval c4 10800000"],
			["swAngT", "+- 0 0 v1"],
			["stT", "?: lef stAngB stAng"],
			["stB", "?: lef stAng stAngB"],
			["swT", "?: lef v1 swAngT"],
			["swB", "?: lef swAngT v1"],
			["wt1", "sin wd2 stT"],
			["ht1", "cos hd2 stT"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["wt2", "sin wd2 stB"],
			["ht2", "cos hd2 stB"],
			["dx2", "cat2 wd2 ht2 wt2"],
			["dy2", "sat2 hd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["wt3", "sin wd2 adj"],
			["ht3", "cos hd2 adj"],
			["dx3", "cat2 wd2 ht3 wt3"],
			["dy3", "sat2 hd2 ht3 wt3"],
			["x3", "+- hc dx3 0"],
			["y3", "+- vc dy3 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"x1",
					"y1"
				], [
					"a",
					"wd2",
					"hd2",
					"stT",
					"swT"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"vc"
				], [
					"l",
					"r",
					"vc"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"x2",
					"y2"
				], [
					"a",
					"wd2",
					"hd2",
					"stB",
					"swB"
				]]
			}
		]
	},
	textbuttonpour: {
		adj: [["adj1", "val cd2"], ["adj2", "val 50000"]],
		gd: [
			["adval", "pin 0 adj1 21599999"],
			["bot", "+- 5400000 0 adval"],
			["lef", "+- 10800000 0 adval"],
			["top", "+- 16200000 0 adval"],
			["rig", "+- 21600000 0 adval"],
			["c3", "?: top adval 0"],
			["c2", "?: lef 10800000 c3"],
			["c1", "?: bot rig c2"],
			["stAng", "?: adval c1 0"],
			["w1", "+- 21600000 0 stAng"],
			["stAngB", "?: stAng w1 0"],
			["td1", "*/ bot 2 1"],
			["td2", "*/ top 2 1"],
			["ntd2", "+- 0 0 td2"],
			["w2", "+- 0 0 10800000"],
			["c6", "?: top ntd2 w2"],
			["c5", "?: lef 10800000 c6"],
			["c4", "?: bot td1 c5"],
			["v1", "?: adval c4 10800000"],
			["swAngT", "+- 0 0 v1"],
			["stT", "?: lef stAngB stAng"],
			["stB", "?: lef stAng stAngB"],
			["swT", "?: lef v1 swAngT"],
			["swB", "?: lef swAngT v1"],
			["wt1", "sin wd2 stT"],
			["ht1", "cos hd2 stT"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["wt6", "sin wd2 stB"],
			["ht6", "cos hd2 stB"],
			["dx6", "cat2 wd2 ht6 wt6"],
			["dy6", "sat2 hd2 ht6 wt6"],
			["x6", "+- hc dx6 0"],
			["y6", "+- vc dy6 0"],
			["adval2", "pin 40000 adj2 99000"],
			["ratio", "*/ adval2 1 100000"],
			["iwd2", "*/ wd2 ratio 1"],
			["ihd2", "*/ hd2 ratio 1"],
			["wt2", "sin iwd2 stT"],
			["ht2", "cos ihd2 stT"],
			["dx2", "cat2 iwd2 ht2 wt2"],
			["dy2", "sat2 ihd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"],
			["wt5", "sin iwd2 stB"],
			["ht5", "cos ihd2 stB"],
			["dx5", "cat2 iwd2 ht5 wt5"],
			["dy5", "sat2 ihd2 ht5 wt5"],
			["x5", "+- hc dx5 0"],
			["y5", "+- vc dy5 0"],
			["d1", "+- hd2 0 ihd2"],
			["d12", "*/ d1 1 2"],
			["yu", "+- vc 0 d12"],
			["yd", "+- vc d12 0"],
			["v1", "*/ d12 d12 1"],
			["v2", "*/ ihd2 ihd2 1"],
			["v3", "*/ v1 1 v2"],
			["v4", "+- 1 0 v3"],
			["v5", "*/ iwd2 iwd2 1"],
			["v6", "*/ v4 v5 1"],
			["v7", "sqrt v6"],
			["xl", "+- hc 0 v7"],
			["xr", "+- hc v7 0"],
			["wtadj", "sin iwd2 adj1"],
			["htadj", "cos ihd2 adj1"],
			["dxadj", "cat2 iwd2 htadj wtadj"],
			["dyadj", "sat2 ihd2 htadj wtadj"],
			["xadj", "+- hc dxadj 0"],
			["yadj", "+- vc dyadj 0"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"x1",
					"y1"
				], [
					"a",
					"wd2",
					"hd2",
					"stT",
					"swT"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"x2",
					"y2"
				], [
					"a",
					"iwd2",
					"ihd2",
					"stT",
					"swT"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"xl",
					"yu"
				], [
					"l",
					"xr",
					"yu"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"xl",
					"yd"
				], [
					"l",
					"xr",
					"yd"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"x5",
					"y5"
				], [
					"a",
					"iwd2",
					"ihd2",
					"stB",
					"swB"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"x6",
					"y6"
				], [
					"a",
					"wd2",
					"hd2",
					"stB",
					"swB"
				]]
			}
		]
	},
	textcandown: {
		adj: [["adj", "val 14286"]],
		gd: [
			["a", "pin 0 adj 33333"],
			["dy", "*/ a h 100000"],
			["y0", "+- t dy 0"],
			["y1", "+- b 0 dy"],
			["ncd2", "*/ cd2 -1 1"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"a",
				"wd2",
				"dy",
				"cd2",
				"ncd2"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"a",
				"wd2",
				"dy",
				"cd2",
				"ncd2"
			]]
		}]
	},
	textcanup: {
		adj: [["adj", "val 85714"]],
		gd: [
			["a", "pin 66667 adj 100000"],
			["dy1", "*/ a h 100000"],
			["dy", "+- h 0 dy1"],
			["y0", "+- t dy1 0"],
			["y1", "+- t dy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"a",
				"wd2",
				"dy",
				"cd2",
				"cd2"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"a",
				"wd2",
				"dy",
				"cd2",
				"cd2"
			]]
		}]
	},
	textcascadedown: {
		adj: [["adj", "val 44444"]],
		gd: [
			["a", "pin 28570 adj 100000"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["dy2", "+- h 0 dy"],
			["dy3", "*/ dy2 1 4"],
			["y2", "+- t dy3 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"l",
				"r",
				"y2"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	textcascadeup: {
		adj: [["adj", "val 44444"]],
		gd: [
			["a", "pin 28570 adj 100000"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["dy2", "+- h 0 dy"],
			["dy3", "*/ dy2 1 4"],
			["y2", "+- t dy3 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y2"
			], [
				"l",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"l",
				"r",
				"y1"
			]]
		}]
	},
	textchevron: {
		adj: [["adj", "val 25000"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["y", "*/ a h 100000"],
			["y1", "+- t b y"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"r",
					"y"
				]
			]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"b"
				],
				[
					"l",
					"hc",
					"y1"
				],
				[
					"l",
					"r",
					"b"
				]
			]
		}]
	},
	textchevroninverted: {
		adj: [["adj", "val 75000"]],
		gd: [
			["a", "pin 50000 adj 100000"],
			["y", "*/ a h 100000"],
			["y1", "+- b 0 y"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"t"
				],
				[
					"l",
					"hc",
					"y1"
				],
				[
					"l",
					"r",
					"t"
				]
			]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"r",
					"y"
				]
			]
		}]
	},
	textcircle: {
		adj: [["adj", "val 10800000"]],
		gd: [
			["adval", "pin 0 adj 21599999"],
			["d0", "+- adval 0 10800000"],
			["d1", "+- 10800000 0 adval"],
			["d2", "+- 21600000 0 adval"],
			["d3", "?: d1 d1 10799999"],
			["d4", "?: d0 d2 d3"],
			["swAng", "*/ d4 2 1"],
			["wt1", "sin wd2 adj"],
			["ht1", "cos hd2 adj"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x1",
				"y1"
			], [
				"a",
				"wd2",
				"hd2",
				"adval",
				"swAng"
			]]
		}]
	},
	textcirclepour: {
		adj: [["adj1", "val cd2"], ["adj2", "val 50000"]],
		gd: [
			["adval", "pin 0 adj1 21599999"],
			["d0", "+- adval 0 10800000"],
			["d1", "+- 10800000 0 adval"],
			["d2", "+- 21600000 0 adval"],
			["d3", "?: d1 d1 10799999"],
			["d4", "?: d0 d2 d3"],
			["swAng", "*/ d4 2 1"],
			["wt1", "sin wd2 adval"],
			["ht1", "cos hd2 adval"],
			["dx1", "cat2 wd2 ht1 wt1"],
			["dy1", "sat2 hd2 ht1 wt1"],
			["x1", "+- hc dx1 0"],
			["y1", "+- vc dy1 0"],
			["adval2", "pin 0 adj2 99000"],
			["ratio", "*/ adval2 1 100000"],
			["iwd2", "*/ wd2 ratio 1"],
			["ihd2", "*/ hd2 ratio 1"],
			["wt2", "sin iwd2 adval"],
			["ht2", "cos ihd2 adval"],
			["dx2", "cat2 iwd2 ht2 wt2"],
			["dy2", "sat2 ihd2 ht2 wt2"],
			["x2", "+- hc dx2 0"],
			["y2", "+- vc dy2 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x1",
				"y1"
			], [
				"a",
				"wd2",
				"hd2",
				"adval",
				"swAng"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x2",
				"y2"
			], [
				"a",
				"iwd2",
				"ihd2",
				"adval",
				"swAng"
			]]
		}]
	},
	textcurvedown: {
		adj: [["adj", "val 45977"]],
		gd: [
			["a", "pin 0 adj 56338"],
			["dy", "*/ a h 100000"],
			["gd1", "*/ dy 3 4"],
			["gd2", "*/ dy 5 4"],
			["gd3", "*/ dy 3 8"],
			["gd4", "*/ dy 1 8"],
			["gd5", "+- h 0 gd3"],
			["gd6", "+- gd4 h 0"],
			["y0", "+- t dy 0"],
			["y1", "+- t gd1 0"],
			["y2", "+- t gd2 0"],
			["y3", "+- t gd3 0"],
			["y4", "+- t gd4 0"],
			["y5", "+- t gd5 0"],
			["y6", "+- t gd6 0"],
			["x1", "+- l wd3 0"],
			["x2", "+- r 0 wd3"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"C",
				"x1",
				"y1",
				"x2",
				"y2",
				"r",
				"y0"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y5"
			], [
				"C",
				"x1",
				"y6",
				"x2",
				"y6",
				"r",
				"y5"
			]]
		}]
	},
	textcurveup: {
		adj: [["adj", "val 45977"]],
		gd: [
			["a", "pin 0 adj 56338"],
			["dy", "*/ a h 100000"],
			["gd1", "*/ dy 3 4"],
			["gd2", "*/ dy 5 4"],
			["gd3", "*/ dy 3 8"],
			["gd4", "*/ dy 1 8"],
			["gd5", "+- h 0 gd3"],
			["gd6", "+- gd4 h 0"],
			["y0", "+- t dy 0"],
			["y1", "+- t gd1 0"],
			["y2", "+- t gd2 0"],
			["y3", "+- t gd3 0"],
			["y4", "+- t gd4 0"],
			["y5", "+- t gd5 0"],
			["y6", "+- t gd6 0"],
			["x1", "+- l wd3 0"],
			["x2", "+- r 0 wd3"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y0"
			], [
				"C",
				"x1",
				"y2",
				"x2",
				"y1",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y5"
			], [
				"C",
				"x1",
				"y6",
				"x2",
				"y6",
				"r",
				"y5"
			]]
		}]
	},
	textdeflate: {
		adj: [["adj", "val 18750"]],
		gd: [
			["a", "pin 0 adj 37500"],
			["dy", "*/ a ss 100000"],
			["gd0", "*/ dy 4 3"],
			["gd1", "+- h 0 gd0"],
			["adjY", "+- t dy 0"],
			["y0", "+- t gd0 0"],
			["y1", "+- t gd1 0"],
			["x0", "+- l wd3 0"],
			["x1", "+- r 0 wd3"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"C",
				"x0",
				"y0",
				"x1",
				"y0",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"C",
				"x0",
				"y1",
				"x1",
				"y1",
				"r",
				"b"
			]]
		}]
	},
	textdeflatebottom: {
		adj: [["adj", "val 50000"]],
		gd: [
			["a", "pin 6250 adj 100000"],
			["dy", "*/ a ss 100000"],
			["dy2", "+- h 0 dy"],
			["y1", "+- t dy 0"],
			["cp", "+- y1 0 dy2"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"l",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"Q",
				"hc",
				"cp",
				"r",
				"b"
			]]
		}]
	},
	textdeflateinflate: {
		adj: [["adj", "val 35000"]],
		gd: [
			["a", "pin 5000 adj 95000"],
			["dy", "*/ a h 100000"],
			["del", "*/ h 5 100"],
			["dh1", "*/ h 45 100"],
			["dh2", "*/ h 55 100"],
			["yh", "+- dy 0 del"],
			["yl", "+- dy del 0"],
			["y3", "+- yh yh dh1"],
			["y4", "+- yl yl dh2"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"t"
				], [
					"l",
					"r",
					"t"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"dh1"
				], [
					"Q",
					"hc",
					"y3",
					"r",
					"dh1"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"dh2"
				], [
					"Q",
					"hc",
					"y4",
					"r",
					"dh2"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"b"
				], [
					"l",
					"r",
					"b"
				]]
			}
		]
	},
	textdeflateinflatedeflate: {
		adj: [["adj", "val 25000"]],
		gd: [
			["a", "pin 3000 adj 47000"],
			["dy", "*/ a h 100000"],
			["del", "*/ h 3 100"],
			["ey1", "*/ h 30 100"],
			["ey2", "*/ h 36 100"],
			["ey3", "*/ h 63 100"],
			["ey4", "*/ h 70 100"],
			["by", "+- b 0 dy"],
			["yh1", "+- dy 0 del"],
			["yl1", "+- dy del 0"],
			["yh2", "+- by 0 del"],
			["yl2", "+- by del 0"],
			["y1", "+- yh1 yh1 ey1"],
			["y2", "+- yl1 yl1 ey2"],
			["y3", "+- yh2 yh2 ey3"],
			["y4", "+- yl2 yl2 ey4"]
		],
		paths: [
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"t"
				], [
					"l",
					"r",
					"t"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"ey1"
				], [
					"Q",
					"hc",
					"y1",
					"r",
					"ey1"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"ey2"
				], [
					"Q",
					"hc",
					"y2",
					"r",
					"ey2"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"ey3"
				], [
					"Q",
					"hc",
					"y3",
					"r",
					"ey3"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"ey4"
				], [
					"Q",
					"hc",
					"y4",
					"r",
					"ey4"
				]]
			},
			{
				w: null,
				h: null,
				fill: null,
				stroke: !0,
				extrusionOk: !0,
				cmds: [[
					"m",
					"l",
					"b"
				], [
					"l",
					"r",
					"b"
				]]
			}
		]
	},
	textdeflatetop: {
		adj: [["adj", "val 50000"]],
		gd: [
			["a", "pin 0 adj 93750"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["cp", "+- y1 dy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"Q",
				"hc",
				"cp",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	textdoublewave1: {
		adj: [["adj1", "val 6250"], ["adj2", "val 0"]],
		gd: [
			["a1", "pin 0 adj1 12500"],
			["a2", "pin -10000 adj2 10000"],
			["y1", "*/ h a1 100000"],
			["dy2", "*/ y1 10 3"],
			["y2", "+- y1 0 dy2"],
			["y3", "+- y1 dy2 0"],
			["y4", "+- b 0 y1"],
			["y5", "+- y4 0 dy2"],
			["y6", "+- y4 dy2 0"],
			["of", "*/ w a2 100000"],
			["of2", "*/ w a2 50000"],
			["x1", "abs of"],
			["dx2", "?: of2 0 of2"],
			["x2", "+- l 0 dx2"],
			["dx8", "?: of2 of2 0"],
			["x8", "+- r 0 dx8"],
			["dx3", "+/ dx2 x8 6"],
			["x3", "+- x2 dx3 0"],
			["dx4", "+/ dx2 x8 3"],
			["x4", "+- x2 dx4 0"],
			["x5", "+/ x2 x8 2"],
			["x6", "+- x5 dx3 0"],
			["x7", "+/ x6 x8 2"],
			["x9", "+- l dx8 0"],
			["x15", "+- r dx2 0"],
			["x10", "+- x9 dx3 0"],
			["x11", "+- x9 dx4 0"],
			["x12", "+/ x9 x15 2"],
			["x13", "+- x12 dx3 0"],
			["x14", "+/ x13 x15 2"],
			["x16", "+- r 0 x1"],
			["xAdj", "+- hc of 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x2",
					"y1"
				],
				[
					"C",
					"x3",
					"y2",
					"x4",
					"y3",
					"x5",
					"y1"
				],
				[
					"C",
					"x6",
					"y2",
					"x7",
					"y3",
					"x8",
					"y1"
				]
			]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x9",
					"y4"
				],
				[
					"C",
					"x10",
					"y5",
					"x11",
					"y6",
					"x12",
					"y4"
				],
				[
					"C",
					"x13",
					"y5",
					"x14",
					"y6",
					"x15",
					"y4"
				]
			]
		}]
	},
	textfadedown: {
		adj: [["adj", "val 33333"]],
		gd: [
			["a", "pin 0 adj 49999"],
			["dx", "*/ a w 100000"],
			["x1", "+- l dx 0"],
			["x2", "+- r 0 dx"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"l",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x1",
				"b"
			], [
				"l",
				"x2",
				"b"
			]]
		}]
	},
	textfadeleft: {
		adj: [["adj", "val 33333"]],
		gd: [
			["a", "pin 0 adj 49999"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["y2", "+- b 0 dy"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"l",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y2"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	textfaderight: {
		adj: [["adj", "val 33333"]],
		gd: [
			["a", "pin 0 adj 49999"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["y2", "+- b 0 dy"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"l",
				"r",
				"y1"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"l",
				"r",
				"y2"
			]]
		}]
	},
	textfadeup: {
		adj: [["adj", "val 33333"]],
		gd: [
			["a", "pin 0 adj 49999"],
			["dx", "*/ a w 100000"],
			["x1", "+- l dx 0"],
			["x2", "+- r 0 dx"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x1",
				"t"
			], [
				"l",
				"x2",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	textinflate: {
		adj: [["adj", "val 18750"]],
		gd: [
			["a", "pin 0 adj 20000"],
			["dy", "*/ a h 100000"],
			["gd", "*/ dy 1 3"],
			["gd0", "+- 0 0 gd"],
			["gd1", "+- h 0 gd0"],
			["ty", "+- t dy 0"],
			["by", "+- b 0 dy"],
			["y0", "+- t gd0 0"],
			["y1", "+- t gd1 0"],
			["x0", "+- l wd3 0"],
			["x1", "+- r 0 wd3"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"ty"
			], [
				"C",
				"x0",
				"y0",
				"x1",
				"y0",
				"r",
				"ty"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"by"
			], [
				"C",
				"x0",
				"y1",
				"x1",
				"y1",
				"r",
				"by"
			]]
		}]
	},
	textinflatebottom: {
		adj: [["adj", "val 60000"]],
		gd: [
			["a", "pin 60000 adj 100000"],
			["dy", "*/ a h 100000"],
			["ty", "+- t dy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"l",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"ty"
			], [
				"Q",
				"hc",
				"b",
				"r",
				"ty"
			]]
		}]
	},
	textinflatetop: {
		adj: [["adj", "val 40000"]],
		gd: [
			["a", "pin 0 adj 50000"],
			["dy", "*/ a h 100000"],
			["ty", "+- t dy 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"ty"
			], [
				"Q",
				"hc",
				"t",
				"r",
				"ty"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	textplain: {
		adj: [["adj", "val 50000"]],
		gd: [
			["a", "pin 30000 adj 70000"],
			["mid", "*/ a w 100000"],
			["midDir", "+- mid 0 hc"],
			["dl", "+- mid 0 l"],
			["dr", "+- r 0 mid"],
			["dl2", "*/ dl 2 1"],
			["dr2", "*/ dr 2 1"],
			["dx", "?: midDir dr2 dl2"],
			["xr", "+- l dx 0"],
			["xl", "+- r 0 dx"],
			["tlx", "?: midDir l xl"],
			["trx", "?: midDir xr r"],
			["blx", "?: midDir xl l"],
			["brx", "?: midDir r xr"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"tlx",
				"t"
			], [
				"l",
				"trx",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"blx",
				"b"
			], [
				"l",
				"brx",
				"b"
			]]
		}]
	},
	textringinside: {
		adj: [["adj", "val 60000"]],
		gd: [
			["a", "pin 50000 adj 99000"],
			["dy", "*/ a h 100000"],
			["y", "+- t dy 0"],
			["r", "*/ dy 1 2"],
			["y1", "+- t r 0"],
			["y2", "+- b 0 r"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"a",
				"wd2",
				"r",
				"10800000",
				"21599999"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y2"
			], [
				"a",
				"wd2",
				"r",
				"10800000",
				"21599999"
			]]
		}]
	},
	textringoutside: {
		adj: [["adj", "val 60000"]],
		gd: [
			["a", "pin 50000 adj 99000"],
			["dy", "*/ a h 100000"],
			["y", "+- t dy 0"],
			["r", "*/ dy 1 2"],
			["y1", "+- t r 0"],
			["y2", "+- b 0 r"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"a",
				"wd2",
				"r",
				"10800000",
				"-21599999"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y2"
			], [
				"a",
				"wd2",
				"r",
				"10800000",
				"-21599999"
			]]
		}]
	},
	textslantdown: {
		adj: [["adj", "val 44445"]],
		gd: [
			["a", "pin 28569 adj 100000"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["y2", "+- b 0 dy"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"l",
				"r",
				"y2"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	textslantup: {
		adj: [["adj", "val 55555"]],
		gd: [
			["a", "pin 0 adj 71431"],
			["dy", "*/ a h 100000"],
			["y1", "+- t dy 0"],
			["y2", "+- b 0 dy"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"y1"
			], [
				"l",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"l",
				"r",
				"y2"
			]]
		}]
	},
	textstop: {
		adj: [["adj", "val 25000"]],
		gd: [
			["a", "pin 14286 adj 50000"],
			["dx", "*/ w 1 3"],
			["dy", "*/ a h 100000"],
			["x1", "+- l dx 0"],
			["x2", "+- r 0 dx"],
			["y1", "+- t dy 0"],
			["y2", "+- b 0 dy"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y1"
				],
				[
					"l",
					"x1",
					"t"
				],
				[
					"l",
					"x2",
					"t"
				],
				[
					"l",
					"r",
					"y1"
				]
			]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y2"
				],
				[
					"l",
					"x1",
					"b"
				],
				[
					"l",
					"x2",
					"b"
				],
				[
					"l",
					"r",
					"y2"
				]
			]
		}]
	},
	texttriangle: {
		adj: [["adj", "val 50000"]],
		gd: [["a", "pin 0 adj 100000"], ["y", "*/ a h 100000"]],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y"
				],
				[
					"l",
					"hc",
					"t"
				],
				[
					"l",
					"r",
					"y"
				]
			]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"b"
			], [
				"l",
				"r",
				"b"
			]]
		}]
	},
	texttriangleinverted: {
		adj: [["adj", "val 50000"]],
		gd: [["a", "pin 0 adj 100000"], ["y", "*/ a h 100000"]],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"l",
				"t"
			], [
				"l",
				"r",
				"t"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"l",
					"y"
				],
				[
					"l",
					"hc",
					"b"
				],
				[
					"l",
					"r",
					"y"
				]
			]
		}]
	},
	textwave1: {
		adj: [["adj1", "val 12500"], ["adj2", "val 0"]],
		gd: [
			["a1", "pin 0 adj1 20000"],
			["a2", "pin -10000 adj2 10000"],
			["y1", "*/ h a1 100000"],
			["dy2", "*/ y1 10 3"],
			["y2", "+- y1 0 dy2"],
			["y3", "+- y1 dy2 0"],
			["y4", "+- b 0 y1"],
			["y5", "+- y4 0 dy2"],
			["y6", "+- y4 dy2 0"],
			["of", "*/ w a2 100000"],
			["of2", "*/ w a2 50000"],
			["x1", "abs of"],
			["dx2", "?: of2 0 of2"],
			["x2", "+- l 0 dx2"],
			["dx5", "?: of2 of2 0"],
			["x5", "+- r 0 dx5"],
			["dx3", "+/ dx2 x5 3"],
			["x3", "+- x2 dx3 0"],
			["x4", "+/ x3 x5 2"],
			["x6", "+- l dx5 0"],
			["x10", "+- r dx2 0"],
			["x7", "+- x6 dx3 0"],
			["x8", "+/ x7 x10 2"],
			["x9", "+- r 0 x1"],
			["xAdj", "+- hc of 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x2",
				"y1"
			], [
				"C",
				"x3",
				"y2",
				"x4",
				"y3",
				"x5",
				"y1"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x6",
				"y4"
			], [
				"C",
				"x7",
				"y5",
				"x8",
				"y6",
				"x10",
				"y4"
			]]
		}]
	},
	textwave2: {
		adj: [["adj1", "val 12500"], ["adj2", "val 0"]],
		gd: [
			["a1", "pin 0 adj1 20000"],
			["a2", "pin -10000 adj2 10000"],
			["y1", "*/ h a1 100000"],
			["dy2", "*/ y1 10 3"],
			["y2", "+- y1 0 dy2"],
			["y3", "+- y1 dy2 0"],
			["y4", "+- b 0 y1"],
			["y5", "+- y4 0 dy2"],
			["y6", "+- y4 dy2 0"],
			["of", "*/ w a2 100000"],
			["of2", "*/ w a2 50000"],
			["x1", "abs of"],
			["dx2", "?: of2 0 of2"],
			["x2", "+- l 0 dx2"],
			["dx5", "?: of2 of2 0"],
			["x5", "+- r 0 dx5"],
			["dx3", "+/ dx2 x5 3"],
			["x3", "+- x2 dx3 0"],
			["x4", "+/ x3 x5 2"],
			["x6", "+- l dx5 0"],
			["x10", "+- r dx2 0"],
			["x7", "+- x6 dx3 0"],
			["x8", "+/ x7 x10 2"],
			["x9", "+- r 0 x1"],
			["xAdj", "+- hc of 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x2",
				"y1"
			], [
				"C",
				"x3",
				"y3",
				"x4",
				"y2",
				"x5",
				"y1"
			]]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [[
				"m",
				"x6",
				"y4"
			], [
				"C",
				"x7",
				"y6",
				"x8",
				"y5",
				"x10",
				"y4"
			]]
		}]
	},
	textwave4: {
		adj: [["adj1", "val 6250"], ["adj2", "val 0"]],
		gd: [
			["a1", "pin 0 adj1 12500"],
			["a2", "pin -10000 adj2 10000"],
			["y1", "*/ h a1 100000"],
			["dy2", "*/ y1 10 3"],
			["y2", "+- y1 0 dy2"],
			["y3", "+- y1 dy2 0"],
			["y4", "+- b 0 y1"],
			["y5", "+- y4 0 dy2"],
			["y6", "+- y4 dy2 0"],
			["of", "*/ w a2 100000"],
			["of2", "*/ w a2 50000"],
			["x1", "abs of"],
			["dx2", "?: of2 0 of2"],
			["x2", "+- l 0 dx2"],
			["dx8", "?: of2 of2 0"],
			["x8", "+- r 0 dx8"],
			["dx3", "+/ dx2 x8 6"],
			["x3", "+- x2 dx3 0"],
			["dx4", "+/ dx2 x8 3"],
			["x4", "+- x2 dx4 0"],
			["x5", "+/ x2 x8 2"],
			["x6", "+- x5 dx3 0"],
			["x7", "+/ x6 x8 2"],
			["x9", "+- l dx8 0"],
			["x15", "+- r dx2 0"],
			["x10", "+- x9 dx3 0"],
			["x11", "+- x9 dx4 0"],
			["x12", "+/ x9 x15 2"],
			["x13", "+- x12 dx3 0"],
			["x14", "+/ x13 x15 2"],
			["x16", "+- r 0 x1"],
			["xAdj", "+- hc of 0"]
		],
		paths: [{
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x2",
					"y1"
				],
				[
					"C",
					"x3",
					"y3",
					"x4",
					"y2",
					"x5",
					"y1"
				],
				[
					"C",
					"x6",
					"y3",
					"x7",
					"y2",
					"x8",
					"y1"
				]
			]
		}, {
			w: null,
			h: null,
			fill: null,
			stroke: !0,
			extrusionOk: !0,
			cmds: [
				[
					"m",
					"x9",
					"y4"
				],
				[
					"C",
					"x10",
					"y6",
					"x11",
					"y5",
					"x12",
					"y4"
				],
				[
					"C",
					"x13",
					"y6",
					"x14",
					"y5",
					"x15",
					"y4"
				]
			]
		}]
	}
}, Ze = Math.PI * 2 / 216e5, Qe = Xe, $e = /* @__PURE__ */ new Map();
function et(e) {
	return e.toLowerCase() in Qe;
}
function tt(e) {
	let t = $e.get(e);
	if (t) return t;
	let n = Qe[e];
	return n ? (t = {
		adj: n.adj.map(([e, t]) => [e, re(t)]),
		gd: n.gd.map(([e, t]) => [e, re(t)]),
		paths: n.paths
	}, $e.set(e, t), t) : null;
}
var nt = 48;
function rt(e, t, n, r) {
	let i = e.w == null ? 1 : n / e.w, a = e.h == null ? 1 : r / e.h, o = (e) => e * i, s = (e) => e * a, c = [], l = 0, u = 0;
	for (let n of e.cmds) switch (n[0]) {
		case "m":
			l = o(t.resolve(n[1])), u = s(t.resolve(n[2])), c.push({
				x: l,
				y: u
			});
			break;
		case "l":
			l = o(t.resolve(n[1])), u = s(t.resolve(n[2])), c.push({
				x: l,
				y: u
			});
			break;
		case "C": {
			let e = o(t.resolve(n[1])), r = s(t.resolve(n[2])), i = o(t.resolve(n[3])), a = s(t.resolve(n[4])), d = o(t.resolve(n[5])), f = s(t.resolve(n[6]));
			for (let t = 1; t <= nt; t++) {
				let n = t / nt, o = 1 - n, s = o * o * o * l + 3 * o * o * n * e + 3 * o * n * n * i + n * n * n * d, p = o * o * o * u + 3 * o * o * n * r + 3 * o * n * n * a + n * n * n * f;
				c.push({
					x: s,
					y: p
				});
			}
			l = d, u = f;
			break;
		}
		case "Q": {
			let e = o(t.resolve(n[1])), r = s(t.resolve(n[2])), i = o(t.resolve(n[3])), a = s(t.resolve(n[4]));
			for (let t = 1; t <= nt; t++) {
				let n = t / nt, o = 1 - n, s = o * o * l + 2 * o * n * e + n * n * i, d = o * o * u + 2 * o * n * r + n * n * a;
				c.push({
					x: s,
					y: d
				});
			}
			l = i, u = a;
			break;
		}
		case "a": {
			let e = t.resolve(n[1]), r = t.resolve(n[2]), o = e * i, s = r * a, d = t.resolve(n[3]) * Ze, f = t.resolve(n[4]) * Ze, p = (t) => Math.atan2(e * Math.sin(t), r * Math.cos(t)), m = Math.PI * 2, h = p(d), g = Math.trunc(f / m), _ = f - g * m, v = p(d + _) - h;
			_ > 0 && v < 0 ? v += m : _ < 0 && v > 0 && (v -= m);
			let y = v + g * m, b = l - o * Math.cos(h), x = u - s * Math.sin(h), S = Math.max(nt, Math.ceil(Math.abs(y) / m * 96));
			for (let e = 1; e <= S; e++) {
				let t = h + y * e / S;
				c.push({
					x: b + o * Math.cos(t),
					y: x + s * Math.sin(t)
				});
			}
			l = b + o * Math.cos(h + y), u = x + s * Math.sin(h + y);
			break;
		}
		case "c": break;
	}
	return c;
}
function it(e) {
	let t = [0];
	for (let n = 1; n < e.length; n++) {
		let r = e[n].x - e[n - 1].x, i = e[n].y - e[n - 1].y;
		t.push(t[n - 1] + Math.hypot(r, i));
	}
	return t;
}
function at(e, t, n, r) {
	let i = tt(e.toLowerCase());
	if (!i || i.paths.length === 0) return null;
	let a = te({
		w: n,
		h: r,
		adj: t
	}, i.adj, i.gd), o = i.paths.length === 1, s = rt(i.paths[0], a, n, r), c = o ? s : rt(i.paths[i.paths.length - 1], a, n, r);
	return {
		top: s,
		bottom: c,
		topLen: it(s),
		bottomLen: it(c),
		singleEdge: o
	};
}
function ot(e, t, n) {
	let r = t[t.length - 1];
	if (e.length === 1 || r === 0) return {
		x: e[0].x,
		y: e[0].y,
		tx: 1,
		ty: 0
	};
	let i = Math.max(0, Math.min(1, n)) * r, a = 0, o = t.length - 1;
	for (; a < o - 1;) {
		let e = a + o >> 1;
		t[e] <= i ? a = e : o = e;
	}
	let s = t[o] - t[a] || 1, c = (i - t[a]) / s, l = e[a], u = e[o], d = u.x - l.x, f = u.y - l.y, p = Math.hypot(d, f) || 1;
	return {
		x: l.x + d * c,
		y: l.y + f * c,
		tx: d / p,
		ty: f / p
	};
}
function st(e) {
	return e.topLen[e.topLen.length - 1] ?? 0;
}
function ct(e, t) {
	if (!e.singleEdge) return 1;
	let n = st(e);
	return n <= 0 ? 1 : Math.max(0, Math.min(1, t / n));
}
function lt(e, t, n, r) {
	if (e.singleEdge) {
		let i = ot(e.top, e.topLen, t), a = Math.atan2(i.ty, i.tx), o = i.ty, s = -i.tx, c = n * (1 - r);
		return {
			x: i.x - o * c,
			y: i.y - s * c,
			angle: a,
			vScale: 1,
			shear: 0
		};
	}
	let i = ot(e.top, e.topLen, t), a = ot(e.bottom, e.bottomLen, t), o = a.x - i.x, s = a.y - i.y, c = i.x + o * r, l = i.y + s * r, u = i.tx + a.tx, d = i.ty + a.ty, f = Math.atan2(d, u), p = Math.cos(f), m = Math.sin(f), h = (p * o + m * s) / (n > 0 ? n : 1), g = (-m * o + p * s) / (n > 0 ? n : 1);
	return {
		x: c,
		y: l,
		angle: f,
		vScale: g === 0 ? n > 0 ? Math.hypot(o, s) / n : 1 : g,
		shear: g === 0 ? 0 : h / g
	};
}
//#endregion
//#region packages/core/src/shape/effects.ts
function ut(e, t) {
	return e * t;
}
function dt(e) {
	return e.getContext("2d") ?? null;
}
function ft(e, t, n, r) {
	let i = Math.max(0, Math.floor(e.x - t)), a = Math.max(0, Math.floor(e.y - t)), o = Math.min(n, Math.ceil(e.x + e.w + t)), s = Math.min(r, Math.ceil(e.y + e.h + t));
	return {
		x: i,
		y: a,
		w: Math.max(1, o - i),
		h: Math.max(1, s - a)
	};
}
function pt(e, t) {
	if (t.x === 0 && t.y === 0) return e;
	let n = t.x, r = t.y;
	return new Proxy(e, {
		get(e, t) {
			if (t === "setTransform") return (t) => {
				e.setTransform(t.a, t.b, t.c, t.d, t.e - n, t.f - r);
			};
			let i = Reflect.get(e, t);
			return typeof i == "function" ? i.bind(e) : i;
		},
		set(e, t, n) {
			return e[t] = n, !0;
		}
	});
}
function mt(e, t, n, r, i, a, o) {
	let s = ut(r.blur, i), l = ut(r.dist, i), u = r.dir * Math.PI / 180, d = Math.cos(u) * l, f = Math.sin(u) * l, p = ft(n, Math.ceil(3 * s + Math.abs(l)) + 2, a, o), m = c(p.w, p.h);
	if (!m) return;
	let h = dt(m);
	if (!h) return;
	let g = pt(h, p);
	g.save(), g.fillStyle = Ae(r.color, r.alpha), t(g), g.restore(), g.save(), g.globalCompositeOperation = "destination-out", g.filter = s > 0 ? `blur(${s}px)` : "none", g.translate(d, f), g.fillStyle = "#000", t(g), g.restore(), g.save(), g.globalCompositeOperation = "destination-in", g.filter = "none", g.fillStyle = "#000", t(g), g.restore(), e.save(), e.drawImage(m, p.x, p.y), e.restore();
}
function ht(e, t, n, r, i, a, o, s) {
	let l = ut(r.radius, i);
	if (l <= 0) {
		t(e);
		return;
	}
	let u = ft(n, Math.ceil(l) + 2, a, o), d = n.x - u.x, f = n.y - u.y, p = c(u.w, u.h);
	if (!p) {
		t(e);
		return;
	}
	let m = dt(p);
	if (!m) {
		t(e);
		return;
	}
	let h = pt(m, u), g = s ?? t;
	t(h);
	let _ = c(u.w, u.h), v = c(u.w, u.h), y = _ ? dt(_) : null, b = v ? dt(v) : null;
	if (_ && y && v && b) {
		let t = pt(y, u);
		t.fillStyle = "#000", g(t), b.drawImage(p, d, f, n.w, n.h, d - l, f - l, n.w + l * 2, n.h + l * 2), b.drawImage(p, 0, 0), b.globalCompositeOperation = "destination-in", b.filter = `blur(${l / 3}px)`, b.drawImage(_, 0, 0), b.filter = "none", b.globalCompositeOperation = "source-over", e.save(), e.drawImage(v, u.x, u.y), e.restore();
		return;
	}
	e.save(), e.drawImage(p, 0, 0), e.restore();
}
function gt(e, t, n, r, i, a, o) {
	let s = c(a, o);
	if (!s) return;
	let l = dt(s);
	if (!l) return;
	let u = ut(r.blur, i);
	l.save(), u > 0 && (l.filter = `blur(${u}px)`), t(l), l.restore(), l.save(), l.globalCompositeOperation = "destination-in";
	let d = n.y, f = n.y + n.h, p = l.createLinearGradient(0, f, 0, d), m = _t(r.stPos), h = _t(r.endPos);
	p.addColorStop(0, `rgba(0,0,0,${r.stA})`), m > 0 && p.addColorStop(m, `rgba(0,0,0,${r.stA})`), h < 1 && h > m && p.addColorStop(h, `rgba(0,0,0,${r.endA})`), p.addColorStop(1, `rgba(0,0,0,${r.endA})`), l.fillStyle = p, l.fillRect(0, 0, a, o), l.restore();
	let g = ut(r.dist, i), _ = r.dir * Math.PI / 180, v = Math.cos(_) * g, y = Math.sin(_) * g;
	e.save(), e.translate(n.x + v, f + y), e.scale(r.sx, r.sy), e.translate(-n.x, -f), e.drawImage(s, 0, 0), e.restore();
}
function _t(e) {
	return e < 0 ? 0 : e > 1 ? 1 : e;
}
//#endregion
//#region packages/core/src/shape/scene3d-camera.ts
var J = 26, vt = {
	orthographicFront: {
		kind: "orthographic",
		baseLat: 0,
		baseLon: 0,
		baseRev: 0,
		fovDeg: 0
	},
	perspectiveFront: {
		kind: "perspective",
		baseLat: 0,
		baseLon: 0,
		baseRev: 0,
		fovDeg: J
	},
	perspectiveRelaxed: {
		kind: "perspective",
		baseLat: 0,
		baseLon: 0,
		baseRev: 0,
		fovDeg: J
	},
	perspectiveRelaxedModerately: {
		kind: "perspective",
		baseLat: 0,
		baseLon: 0,
		baseRev: 0,
		fovDeg: J
	},
	perspectiveAbove: {
		kind: "perspective",
		baseLat: -20,
		baseLon: 0,
		baseRev: 0,
		fovDeg: J
	},
	perspectiveBelow: {
		kind: "perspective",
		baseLat: 20,
		baseLon: 0,
		baseRev: 0,
		fovDeg: J
	},
	perspectiveLeft: {
		kind: "perspective",
		baseLat: 0,
		baseLon: -20,
		baseRev: 0,
		fovDeg: J
	},
	perspectiveRight: {
		kind: "perspective",
		baseLat: 0,
		baseLon: 20,
		baseRev: 0,
		fovDeg: J
	}
};
function yt(e, t) {
	let n = Array(9).fill(0);
	for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) {
		let a = 0;
		for (let n = 0; n < 3; n++) a += e[r * 3 + n] * t[n * 3 + i];
		n[r * 3 + i] = a;
	}
	return n;
}
function bt(e) {
	let t = e * Math.PI / 180, n = Math.cos(t), r = Math.sin(t);
	return [
		1,
		0,
		0,
		0,
		n,
		-r,
		0,
		r,
		n
	];
}
function xt(e) {
	let t = e * Math.PI / 180, n = Math.cos(t), r = Math.sin(t);
	return [
		n,
		0,
		r,
		0,
		1,
		0,
		-r,
		0,
		n
	];
}
function St(e) {
	let t = e * Math.PI / 180, n = Math.cos(t), r = Math.sin(t);
	return [
		n,
		-r,
		0,
		r,
		n,
		0,
		0,
		0,
		1
	];
}
function Ct(e, t, n, r) {
	return [
		e[0] * t + e[1] * n + e[2] * r,
		e[3] * t + e[4] * n + e[5] * r,
		e[6] * t + e[7] * n + e[8] * r
	];
}
function wt(e, t) {
	let n = t ? t.lat : e.baseLat, r = t ? t.lon : e.baseLon;
	return yt(St(-(t ? t.rev : e.baseRev)), yt(bt(-n), xt(-r)));
}
function Tt(e) {
	return vt[e] ?? vt.orthographicFront;
}
function Et(e, t, n) {
	let r = Tt(e.prst), i = wt(r, e.rot);
	if (t <= 0 || n <= 0) return {
		corners: [
			{
				x: 0,
				y: 0
			},
			{
				x: t,
				y: 0
			},
			{
				x: t,
				y: n
			},
			{
				x: 0,
				y: n
			}
		],
		isAffine: !0,
		isIdentity: !0
	};
	let a = t / 2, o = n / 2, s = [
		[-a, -o],
		[a, -o],
		[a, o],
		[-a, o]
	], c = e.zoom ?? 1, l = Math.max(a, o), u;
	if (r.kind === "perspective") {
		let t = e.fov ?? r.fovDeg, n = Math.max(1, Math.min(179, t)) * Math.PI / 180, a = l / Math.tan(n / 2);
		u = s.map(([e, t]) => {
			let [n, r, o] = Ct(i, e, t, 0), s = a - o, c = a / (Math.abs(s) < 1e-6 ? 1e-6 * Math.sign(s || 1) : s);
			return [n * c, r * c];
		});
	} else u = s.map(([e, t]) => {
		let [n, r] = Ct(i, e, t, 0);
		return [n, r];
	});
	u = u.map(([e, t]) => [e * c, t * c]);
	let d = Infinity, f = Infinity, p = -Infinity, m = -Infinity;
	for (let [e, t] of u) e < d && (d = e), t < f && (f = t), e > p && (p = e), t > m && (m = t);
	let h = p - d || 1, g = m - f || 1, _ = Math.min(t / h, n / g), v = (d + p) / 2, y = (f + m) / 2, b = u.map(([e, r]) => ({
		x: t / 2 + (e - v) * _,
		y: n / 2 + (r - y) * _
	})), x = .001 * Math.max(t, n), S = b[0].x + b[2].x - (b[1].x + b[3].x), C = b[0].y + b[2].y - (b[1].y + b[3].y), w = Math.abs(S) < x && Math.abs(C) < x, T = [
		[0, 0],
		[t, 0],
		[t, n],
		[0, n]
	], E = !0;
	for (let e = 0; e < 4; e++) if (Math.abs(b[e].x - T[e][0]) > x || Math.abs(b[e].y - T[e][1]) > x) {
		E = !1;
		break;
	}
	return {
		corners: b,
		isAffine: w,
		isIdentity: E
	};
}
function Dt(e) {
	let { isIdentity: t } = Et(e, 1e3, 1e3);
	return !t;
}
function Ot(e, t, n, r) {
	let i = Tt(e.prst), a = wt(i, e.rot);
	if (t <= 0 || n <= 0 || r === 0) return {
		x: 0,
		y: 0
	};
	let o = t / 2, s = n / 2, c = Math.max(o, s), l = e.zoom ?? 1, u = (t) => {
		let [n, r, o] = Ct(a, 0, 0, t);
		if (i.kind === "perspective") {
			let t = e.fov ?? i.fovDeg, a = Math.max(1, Math.min(179, t)) * Math.PI / 180, s = c / Math.tan(a / 2), u = s - o, d = s / (Math.abs(u) < 1e-6 ? 1e-6 * Math.sign(u || 1) : u);
			return [n * d * l, r * d * l];
		}
		return [n * l, r * l];
	}, [d, f] = u(0), [p, m] = u(-r);
	return {
		x: p - d,
		y: m - f
	};
}
//#endregion
//#region packages/core/src/shape/scene3d-draw.ts
function kt(e, t, n, r) {
	let i = e.x, a = e.y, o = t.x, s = t.y, c = n.x, l = n.y, u = r.x, d = r.y, f = o - c, p = u - c, m = i - o + c - u, h = s - l, g = d - l, _ = a - s + l - d, v, y;
	if (Math.abs(m) < 1e-12 && Math.abs(_) < 1e-12) v = 0, y = 0;
	else {
		let e = f * g - p * h;
		if (Math.abs(e) < 1e-12) return null;
		v = (m * g - p * _) / e, y = (f * _ - m * h) / e;
	}
	return [
		o - i + v * o,
		u - i + y * u,
		i,
		s - a + v * s,
		d - a + y * d,
		a,
		v,
		y,
		1
	];
}
function At(e, t, n) {
	let r = e[6] * t + e[7] * n + e[8];
	return {
		x: (e[0] * t + e[1] * n + e[2]) / r,
		y: (e[3] * t + e[4] * n + e[5]) / r
	};
}
var jt = 1;
function Mt(e, t) {
	let [n, r, i, a, o, s] = e, [c, l, u, d, f, p] = t;
	return [
		n * c + i * l,
		r * c + a * l,
		n * u + i * d,
		r * u + a * d,
		n * f + i * p + o,
		r * f + a * p + s
	];
}
function Nt(e, t, n, r, i, a, o, s, c, l, u, d, f) {
	let p = c - o, m = l - s;
	if (p <= 0 || m <= 0) return;
	let h = (d.x - u.x) / p, g = (d.y - u.y) / p, _ = (f.x - u.x) / m, v = (f.y - u.y) / m, y = (Math.hypot(d.x - u.x, d.y - u.y) || 1) * a, b = (Math.hypot(f.x - u.x, f.y - u.y) || 1) * a, x = jt * p / y, S = jt * m / b, C = Math.max(0, o - x), w = Math.max(0, s - S), T = Math.min(n, c + x), E = Math.min(r, l + S), D = T - C, O = E - w;
	if (D <= 0 || O <= 0) return;
	e.save();
	let [k, A, j, M, N, P] = Mt(i, [
		h,
		g,
		_,
		v,
		u.x - o * h - s * _,
		u.y - o * g - s * v
	]);
	e.setTransform(k, A, j, M, N, P), e.drawImage(t, C, w, D, O, C, w, D, O), e.restore();
}
function Pt(e, t, n, r, i, a, o, s, c, l, u, d, f) {
	let p = At(o, s, c), m = At(o, l, c), h = At(o, s, u), g = At(o, l, u), _ = (s + l) / 2, v = (c + u) / 2, y = At(o, _, v), b = {
		x: (p.x + m.x + h.x + g.x) / 4,
		y: (p.y + m.y + h.y + g.y) / 4
	}, x = It(i), S = Math.hypot(y.x - b.x, y.y - b.y) * x;
	if (f <= 0 || S <= d) {
		Nt(e, t, n, r, i, a, s * n, c * r, l * n, u * r, p, m, h);
		return;
	}
	l - s >= u - c ? (Pt(e, t, n, r, i, a, o, s, c, _, u, d, f - 1), Pt(e, t, n, r, i, a, o, _, c, l, u, d, f - 1)) : (Pt(e, t, n, r, i, a, o, s, c, l, v, d, f - 1), Pt(e, t, n, r, i, a, o, s, v, l, u, d, f - 1));
}
function Ft(e, t, n, r, i, a = .5) {
	if (n <= 0 || r <= 0) return;
	let [o, s, c, l] = i;
	if (Math.abs(o.x * s.y - s.x * o.y + s.x * c.y - c.x * s.y + c.x * l.y - l.x * c.y + l.x * o.y - o.x * l.y) / 2 < 1e-6) return;
	let u = kt(i[0], i[1], i[2], i[3]);
	if (!u) return;
	let d = t.getTransform(), f = [
		d.a,
		d.b,
		d.c,
		d.d,
		d.e,
		d.f
	], p = It(f);
	Vt(e, t, n, r, i, f, p, u, a, 14) || (zt(), t.save(), t.beginPath(), t.moveTo(i[0].x, i[0].y), t.lineTo(i[1].x, i[1].y), t.lineTo(i[2].x, i[2].y), t.lineTo(i[3].x, i[3].y), t.closePath(), t.clip(), Pt(t, e, n, r, f, p, u, 0, 0, 1, 1, a, 14), t.restore());
}
function It(e) {
	return Math.sqrt(Math.abs(e[0] * e[3] - e[1] * e[2])) || 1;
}
function Lt(e, t, n) {
	let r = kt(e[0], e[1], e[2], e[3]);
	if (!r) return null;
	let i = [
		[-t, -n],
		[1 + t, -n],
		[1 + t, 1 + n],
		[-t, 1 + n]
	], a = [];
	for (let [e, t] of i) {
		if (!(r[6] * e + r[7] * t + r[8] > 1e-9)) return null;
		a.push(At(r, e, t));
	}
	return a;
}
var Rt = !1;
function zt() {
	Rt || (Rt = !0, typeof console < "u" && typeof console.warn == "function" && console.warn("[ooxml] scene3d: no offscreen canvas available — using the direct warp fallback (per-cell bleed only, no supersample). Textured-source seams may be faintly visible; the silhouette and geometry are unaffected."));
}
var Bt = 2;
function Vt(e, t, n, r, i, a, o, s, l, u) {
	let d = i.map((e) => ({
		x: a[0] * e.x + a[2] * e.y + a[4],
		y: a[1] * e.x + a[3] * e.y + a[5]
	})), f = Infinity, p = Infinity, m = -Infinity, h = -Infinity;
	for (let e of d) e.x < f && (f = e.x), e.y < p && (p = e.y), e.x > m && (m = e.x), e.y > h && (h = e.y);
	f = Math.floor(f) - 1, p = Math.floor(p) - 1, m = Math.ceil(m) + 1, h = Math.ceil(h) + 1;
	let g = m - f, _ = h - p;
	if (g <= 0 || _ <= 0) return !1;
	let v = Math.max(1, Math.ceil(g * Bt)), y = Math.max(1, Math.ceil(_ * Bt)), b = c(v, y);
	if (!b || b.width !== v || b.height !== y) return !1;
	let x = b.getContext("2d") ?? null;
	if (!x) return !1;
	let S = Bt, C = [
		a[0] * S,
		a[1] * S,
		a[2] * S,
		a[3] * S,
		(a[4] - f) * S,
		(a[5] - p) * S
	];
	x.save(), x.setTransform(C[0], C[1], C[2], C[3], C[4], C[5]), x.beginPath(), x.moveTo(i[0].x, i[0].y), x.lineTo(i[1].x, i[1].y), x.lineTo(i[2].x, i[2].y), x.lineTo(i[3].x, i[3].y), x.closePath(), x.clip(), Pt(x, e, n, r, C, o, s, 0, 0, 1, 1, l * S, u), x.restore(), t.save(), t.setTransform(1, 0, 0, 1, 0, 0);
	let w = t.imageSmoothingEnabled, T = t.imageSmoothingQuality;
	return t.imageSmoothingEnabled = !0, t.imageSmoothingQuality = "high", t.drawImage(b, 0, 0, g * S, _ * S, f, p, g, _), t.imageSmoothingEnabled = w, t.imageSmoothingQuality = T, t.restore(), !0;
}
//#endregion
//#region packages/core/src/shape/bevel-shading.ts
function Ht(e, t) {
	if (t <= 0) return () => 1;
	let n = (e) => Math.max(0, Math.min(1, e / t));
	switch (e) {
		case "hardEdge": {
			let e = Xt;
			return (t) => {
				let r = Math.min(1, n(t) / e);
				return r * r * (3 - 2 * r);
			};
		}
		case "angle":
		case "slope": return (e) => n(e);
		case "circle":
		case "convex":
		case "softRound": return (e) => {
			let t = 1 - n(e);
			return Math.sqrt(Math.max(0, 1 - t * t));
		};
		default: return (e) => {
			let t = n(e);
			return t * t * (3 - 2 * t);
		};
	}
}
function Ut(e) {
	let t = e.length, n = new Float64Array(t);
	if (t === 0) return n;
	let r = new Int32Array(t), i = new Float64Array(t + 1), a = 0;
	r[0] = 0, i[0] = -Infinity, i[1] = Infinity;
	for (let n = 1; n < t; n++) {
		let t = (e[n] + n * n - (e[r[a]] + r[a] * r[a])) / (2 * n - 2 * r[a]);
		for (; t <= i[a];) a--, t = (e[n] + n * n - (e[r[a]] + r[a] * r[a])) / (2 * n - 2 * r[a]);
		a++, r[a] = n, i[a] = t, i[a + 1] = Infinity;
	}
	a = 0;
	for (let o = 0; o < t; o++) {
		for (; i[a + 1] < o;) a++;
		let t = o - r[a];
		n[o] = t * t + e[r[a]];
	}
	return n;
}
function Wt(e, t = 3) {
	if (e <= 0) return Array(t).fill(1);
	let n = Math.sqrt(12 * e * e / t + 1), r = Math.floor(n);
	r % 2 == 0 && r--;
	let i = r + 2, a = (12 * e * e - t * r * r - 4 * t * r - 3 * t) / (-4 * r - 4), o = Math.round(a), s = [];
	for (let e = 0; e < t; e++) s.push(e < o ? r : i);
	return s;
}
function Gt(e, t, n, r, i, a) {
	let o = 1 / (2 * i + 1);
	if (a) for (let a = 0; a < r; a++) {
		let r = a * n, s = 0;
		for (let t = 0; t <= i; t++) t < n && (s += e[r + t]);
		for (let a = 0; a < n; a++) {
			t[r + a] = s * o;
			let c = a + i + 1, l = a - i;
			c < n && (s += e[r + c]), l >= 0 && (s -= e[r + l]);
		}
	}
	else for (let a = 0; a < n; a++) {
		let s = 0;
		for (let t = 0; t <= i; t++) t < r && (s += e[t * n + a]);
		for (let c = 0; c < r; c++) {
			t[c * n + a] = s * o;
			let l = c + i + 1, u = c - i;
			l < r && (s += e[l * n + a]), u >= 0 && (s -= e[u * n + a]);
		}
	}
}
function Kt(e, t, n, r) {
	let i = Float64Array.from(e);
	if (r <= 0 || t <= 0 || n <= 0) return i;
	let a = new Float64Array(t * n);
	for (let e of Wt(r, 3)) {
		let r = Math.max(1, (e - 1) / 2);
		Gt(i, a, t, n, r, !0), Gt(a, i, t, n, r, !1);
	}
	return i;
}
function qt(e, t, n, r = 128) {
	let i = new Float64Array(t * n);
	for (let a = 0; a < t * n; a++) i[a] = (e[a] ?? 0) >= r ? 0x56bc75e2d63100000 : 0;
	let a = new Float64Array(n);
	for (let e = 0; e < t; e++) {
		for (let r = 0; r < n; r++) a[r] = i[r * t + e];
		let r = Ut(a);
		for (let a = 0; a < n; a++) i[a * t + e] = r[a];
	}
	let o = new Float64Array(t);
	for (let e = 0; e < n; e++) {
		for (let n = 0; n < t; n++) o[n] = i[e * t + n];
		let n = Ut(o);
		for (let r = 0; r < t; r++) i[e * t + r] = n[r];
	}
	for (let e = 0; e < n; e++) for (let r = 0; r < t; r++) {
		let a = e * t + r;
		if (i[a] === 0) continue;
		let o = (e + 1) * (e + 1), s = (n - e) * (n - e), c = (r + 1) * (r + 1), l = (t - r) * (t - r), u = Math.min(o, s, c, l);
		u < i[a] && (i[a] = u);
	}
	for (let e = 0; e < t * n; e++) i[e] = Math.sqrt(i[e]);
	return i;
}
var Jt = .25, Yt = .35, Xt = .5;
function Zt(e, t, n, r, i, a) {
	let o = new Float32Array(t * n * 3), s = new Uint8Array(t * n), c = new Float32Array(t * n);
	if (t <= 0 || n <= 0) return {
		normals: o,
		bandMask: s,
		bandWeight: c
	};
	let l = qt(e, t, n), u = Ht(i, r), d = (n, r) => (e[r * t + n] ?? 0) >= 128, f = (r > 0 ? a / r : 0) * r, p = Kt(l, t, n, Math.max(1, r * Jt)), m = (e) => {
		let t = u(Math.max(0, e - .5));
		return u(e + .5) - t;
	};
	for (let e = 0; e < n; e++) for (let i = 0; i < t; i++) {
		let a = e * t + i;
		if (!d(i, e)) {
			o[a * 3 + 2] = 1;
			continue;
		}
		let u = l[a], h = u > 0 && u < r;
		if (s[a] = +!!h, !h) {
			o[a * 3 + 2] = 1;
			continue;
		}
		let g = u / r, _ = 1 - Yt, v = 1;
		if (g > _) {
			let e = Math.min(1, (g - _) / Yt);
			v = 1 - e * e * (3 - 2 * e);
		}
		c[a] = v;
		let y = i > 0 ? i - 1 : i, b = i < t - 1 ? i + 1 : i, x = e > 0 ? e - 1 : e, S = e < n - 1 ? e + 1 : e, C = (p[e * t + b] - p[e * t + y]) / (b - y || 1), w = (p[S * t + i] - p[x * t + i]) / (S - x || 1), T = Math.hypot(C, w), E = 0, D = 0;
		T > 1e-9 && (E = -C / T, D = -w / T);
		let O = m(u) * f, k = O * E, A = O * D, j = 1, M = Math.hypot(k, A, j) || 1;
		k /= M, A /= M, j /= M, o[a * 3] = k, o[a * 3 + 1] = A, o[a * 3 + 2] = j;
	}
	return {
		normals: o,
		bandMask: s,
		bandWeight: c
	};
}
var Qt = 35 * Math.PI / 180, $t = 12 * Math.PI / 180, en = {
	t: {
		x: 0,
		y: -1
	},
	b: {
		x: 0,
		y: 1
	},
	l: {
		x: -1,
		y: 0
	},
	r: {
		x: 1,
		y: 0
	},
	tl: {
		x: -1,
		y: -1
	},
	tr: {
		x: 1,
		y: -1
	},
	bl: {
		x: -1,
		y: 1
	},
	br: {
		x: 1,
		y: 1
	}
};
function tn(e, t, n) {
	let r = n * Math.PI / 180, i = Math.cos(r), a = Math.sin(r);
	return {
		x: e * i - t * a,
		y: e * a + t * i
	};
}
function nn(e, t, n) {
	let r = en[t] ?? en.t;
	return n && n.rev && (r = tn(r.x, r.y, n.rev)), an(r.x, r.y, Qt);
}
function rn(e) {
	let t = Math.hypot(e.x, e.y) || 1;
	return an(-e.x / t, -e.y / t, $t);
}
function an(e, t, n) {
	let r = Math.hypot(e, t) || 1, i = Math.cos(n), a = Math.sin(n), o = e / r * i, s = t / r * i, c = a, l = Math.hypot(o, s, c) || 1;
	return {
		x: o / l,
		y: s / l,
		z: c / l
	};
}
var on = 2, sn = {
	matte: {
		ambient: .62,
		diffuse: .45,
		specular: 0,
		shininess: 8
	},
	plastic: {
		ambient: .55,
		diffuse: .5,
		specular: .35,
		shininess: 22
	}
}, cn = .8;
function ln(e) {
	switch (e) {
		case "plastic":
		case "metal":
		case "clear":
		case "softEdge":
		case "shiny":
		case "softmetal": return "plastic";
		default: return "matte";
	}
}
function un(e, t, n = !0) {
	let r = sn[e], i = {
		light: t,
		material: e,
		ambient: r.ambient,
		diffuse: r.diffuse,
		specular: r.specular,
		shininess: r.shininess
	};
	return n && (i.fillLight = rn(t), i.fillDiffuse = i.diffuse * cn), i;
}
function dn(e, t) {
	let n = e.x * t.light.x + e.y * t.light.y + e.z * t.light.z, r = t.diffuse * Math.max(0, n), i = 0;
	if (t.fillLight && t.fillDiffuse) {
		let n = e.x * t.fillLight.x + e.y * t.fillLight.y + e.z * t.fillLight.z;
		i = t.fillDiffuse * Math.max(0, n);
	}
	let a = 0;
	if (t.specular > 0) {
		let n = t.light.x, r = t.light.y, i = t.light.z + 1, o = Math.hypot(n, r, i) || 1, s = (e.x * n + e.y * r + e.z * i) / o;
		a = t.specular * Math.max(0, s) ** +t.shininess;
	}
	return Math.max(0, t.ambient + r + i + a);
}
function fn(e, t, n) {
	if (!e) return {
		x: 0,
		y: 0,
		w: t,
		h: n
	};
	let r = Math.max(0, Math.floor(e.x)), i = Math.max(0, Math.floor(e.y)), a = Math.min(t, Math.ceil(e.x + e.w)), o = Math.min(n, Math.ceil(e.y + e.h));
	return {
		x: r,
		y: i,
		w: Math.max(0, a - r),
		h: Math.max(0, o - i)
	};
}
function pn(e, t, n) {
	let r = e.canvas.width, i = e.canvas.height;
	if (r <= 0 || i <= 0) return;
	let a = t.widthPx;
	if (a < .75) return;
	let { x: o, y: s, w: c, h: l } = fn(n, r, i);
	if (c <= 0 || l <= 0) return;
	let u = e.getImageData(o, s, c, l), d = u.data, f = new Uint8ClampedArray(c * l);
	for (let e = 0; e < c * l; e++) f[e] = d[e * 4 + 3];
	let { bandMask: p, bandWeight: m, normals: h } = Zt(f, c, l, a, t.prst, t.heightPx), g = un(t.material, t.light), _ = dn({
		x: 0,
		y: 0,
		z: 1
	}, g) || 1;
	for (let e = 0; e < c * l; e++) {
		if (p[e] === 0) continue;
		let n = m[e];
		if (n <= 0) continue;
		let r = h[e * 3], i = h[e * 3 + 1], a = h[e * 3 + 2];
		t.bottom && (r = -r, i = -i);
		let o = 1 + (dn({
			x: r,
			y: i,
			z: a
		}, g) / _ - 1) * n, s = e * 4;
		if (o >= 1) {
			let e = Math.min(1, (o - 1) * on);
			for (let t = 0; t < 3; t++) {
				let n = Math.min(255, d[s + t] * o);
				d[s + t] = n + (255 - n) * e;
			}
		} else d[s] = Math.max(0, d[s] * o), d[s + 1] = Math.max(0, d[s + 1] * o), d[s + 2] = Math.max(0, d[s + 2] * o);
	}
	e.putImageData(u, o, s);
}
function mn(e, t, n) {
	let r = e.canvas.width, i = e.canvas.height;
	if (r <= 0 || i <= 0) return;
	let a = t.offsetX, o = t.offsetY, s = Math.hypot(a, o);
	if (s < .75) return;
	let { x: c, y: l, w: u, h: d } = fn(n, r, i);
	if (u <= 0 || d <= 0) return;
	let f = e.getImageData(c, l, u, d), p = f.data, m = new Uint8ClampedArray(u * d);
	for (let e = 0; e < u * d; e++) m[e] = p[e * 4 + 3];
	let h = Math.max(1, Math.ceil(s)), [g, _, v] = t.rgb;
	for (let e = 0; e < d; e++) for (let t = 0; t < u; t++) {
		let n = e * u + t;
		if (m[n] >= 128) continue;
		let r = !1;
		for (let n = 1; n <= h; n++) {
			let i = n / h, s = Math.round(t - a * i), c = Math.round(e - o * i);
			if (!(s < 0 || c < 0 || s >= u || c >= d) && m[c * u + s] >= 128) {
				r = !0;
				break;
			}
		}
		if (!r) continue;
		let i = n * 4;
		p[i] = g, p[i + 1] = _, p[i + 2] = v, p[i + 3] = 255;
	}
	e.putImageData(f, c, l);
}
//#endregion
//#region packages/core/src/text/underline.ts
function hn(e, t, n, r, i, a, o, s = 1) {
	let c = Math.max(1, i * .05), l = o === "heavy" || (o?.endsWith("Heavy") ?? !1) ? c * 1.8 : c, d = n + Math.max(2, l), f = u(d, l, s);
	if (e.strokeStyle = a, e.lineWidth = l, e.setLineDash([]), o && o.startsWith("wavy")) {
		let n = l, i = l * 6;
		e.beginPath(), e.moveTo(t, d);
		let a = Math.max(1, l * .5);
		for (let o = 0; o <= r; o += a) {
			let r = d + Math.sin(o / i * Math.PI * 2) * n;
			e.lineTo(t + o, r);
		}
		if (e.stroke(), o === "wavyDbl") {
			e.beginPath(), e.moveTo(t, d + n * 2.5);
			for (let o = 0; o <= r; o += a) {
				let r = d + n * 2.5 + Math.sin(o / i * Math.PI * 2) * n;
				e.lineTo(t + o, r);
			}
			e.stroke();
		}
		return;
	}
	if (o === "dbl") {
		let n = l * 1.4, i = d - n / 2, a = d + n / 2;
		e.beginPath(), e.moveTo(t, i + u(i, l, s)), e.lineTo(t + r, i + u(i, l, s)), e.moveTo(t, a + u(a, l, s)), e.lineTo(t + r, a + u(a, l, s)), e.stroke();
		return;
	}
	e.setLineDash(Oe(o ?? "sng", l)), e.beginPath(), e.moveTo(t, d + f), e.lineTo(t + r, d + f), e.stroke(), e.setLineDash([]);
}
//#endregion
//#region packages/core/src/text/highlight-box.ts
function gn(e, t) {
	return {
		top: e - t * .85,
		height: t * 1.1
	};
}
//#endregion
//#region packages/core/src/text/justify-positions.ts
function _n(e, t, n, r, i = 0) {
	let a = [], o = 0, s = 0;
	for (let c of t) a.push({
		text: e.slice(o, c).join(""),
		dx: r(e.slice(0, o).join("")) + o * i + s * n
	}), o = c, s++;
	return a.push({
		text: e.slice(o).join(""),
		dx: r(e.slice(0, o).join("")) + o * i + s * n
	}), a;
}
//#endregion
//#region packages/core/src/nav/internal-target.ts
function vn(e, t) {
	let n = t.startsWith("/") ? [] : e.split("/").filter((e) => e !== "");
	for (let e of t.split("/")) if (e === "..") n.pop();
	else if (e === "." || e === "") continue;
	else n.push(e);
	return n.join("/");
}
function yn(e) {
	let t = /[?&]jump=([a-zA-Z]+)/.exec(e);
	if (!t) return null;
	let n = t[1].toLowerCase();
	return n === "firstslide" || n === "lastslide" || n === "nextslide" || n === "previousslide" ? n : null;
}
function bn(e, t, n) {
	if (!(n <= 0)) switch (e) {
		case "firstslide": return 0;
		case "lastslide": return n - 1;
		case "nextslide": return Math.min(t + 1, n - 1);
		case "previousslide": return Math.max(t - 1, 0);
	}
}
//#endregion
//#region packages/pptx/src/text-layer.ts
function xn(e, t, n, r, i) {
	e.innerHTML = "";
	let a = /* @__PURE__ */ new Map();
	for (let o of t) {
		let t = o.rotation + (o.textBodyRotation ?? 0), s = `${o.shapeX},${o.shapeY},${o.shapeW},${o.shapeH},${t}`;
		if (!a.has(s)) {
			let i = document.createElement("div");
			i.style.cssText = `position:absolute;left:${q(o.shapeX, n)};top:${q(o.shapeY, r)};width:${q(o.shapeW, n)};height:${q(o.shapeH, r)};pointer-events:all;overflow:hidden;`, t !== 0 && (i.style.transformOrigin = "center center", i.style.transform = `rotate(${t}deg)`), a.set(s, {
				div: i,
				x: o.shapeX,
				y: o.shapeY,
				w: o.shapeW,
				h: o.shapeH,
				rot: t
			}), e.appendChild(i);
		}
		let c = a.get(s), l = document.createElement("span");
		l.textContent = o.text;
		let u = i ? o.hyperlink : void 0;
		l.style.cssText = `position:absolute;left:${q(o.inShapeX, c.w)};top:${q(o.inShapeY, c.h)};font:${o.font};line-height:${o.h}px;letter-spacing:0;white-space:pre;color:transparent;cursor:${u ? "pointer" : "text"};`, u && i && (l.title = u.kind === "external" ? u.url : u.ref, l.addEventListener("click", (e) => {
			e.preventDefault(), i(u);
		})), c.div.appendChild(l);
	}
}
function Sn(e, t, n, r, i, a, o = {}) {
	e.innerHTML = "";
	let s = o.match ?? "rgba(255, 214, 0, 0.42)", c = o.active ?? "rgba(255, 140, 0, 0.55)", l = /* @__PURE__ */ new Map(), u = (t) => {
		let n = t.rotation + (t.textBodyRotation ?? 0), a = `${t.shapeX},${t.shapeY},${t.shapeW},${t.shapeH},${n}`, o = l.get(a);
		if (!o) {
			let s = document.createElement("div");
			s.style.cssText = `position:absolute;left:${q(t.shapeX, r)};top:${q(t.shapeY, i)};width:${q(t.shapeW, r)};height:${q(t.shapeH, i)};pointer-events:none;overflow:hidden;`, n !== 0 && (s.style.transformOrigin = "center center", s.style.transform = `rotate(${n}deg)`), o = {
				div: s,
				w: t.shapeW,
				h: t.shapeH
			}, l.set(a, o), e.appendChild(s);
		}
		return o;
	};
	for (let e of n) {
		let n = e.active ? c : s;
		for (let r of e.slices) {
			let e = t[r.runIndex];
			if (!e) continue;
			let i = a(e.font), { x: o, width: s } = ze(e.text, r.start, r.end, i);
			if (s <= 0) continue;
			let c = u(e), l = document.createElement("div");
			l.style.cssText = `position:absolute;left:${q(e.inShapeX + o, c.w)};top:${q(e.inShapeY, c.h)};width:${q(s, c.w)};height:${q(e.h, c.h)};background:${n};pointer-events:none;`, c.div.appendChild(l);
		}
	}
}
//#endregion
//#region packages/pptx/src/find.ts
var Cn = class {
	_slideRuns = /* @__PURE__ */ new Map();
	_matches = [];
	_active = -1;
	constructor(e, t) {
		this._slideCount = e, this._collectSlideRuns = t;
	}
	invalidate() {
		this._slideRuns.clear(), this._matches = [], this._active = -1;
	}
	slideRuns(e) {
		return this._slideRuns.get(e);
	}
	setSlideRuns(e, t) {
		this._slideRuns.set(e, t);
	}
	slideHighlights(e) {
		let t = [];
		for (let n = 0; n < this._matches.length; n++) {
			let r = this._matches[n];
			r.slide === e && t.push({
				slices: r.slices,
				active: n === this._active
			});
		}
		return t;
	}
	activeSlide() {
		let e = this._matches[this._active];
		return e ? e.slide : null;
	}
	matches() {
		return this._matches.map((e, t) => ({
			matchIndex: t,
			text: e.text,
			location: { slide: e.slide }
		}));
	}
	async find(e, t = {}) {
		if (this._matches = [], this._active = -1, e.length === 0) return [];
		let n = this._slideCount();
		for (let r = 0; r < n; r++) {
			let n = await this._ensureSlideRuns(r), i = ve(n);
			for (let a of ie(i, e, t)) {
				let e = a.slices.map((e) => n[e.runIndex].text.slice(e.start, e.end)).join("");
				this._matches.push({
					slide: r,
					text: e,
					slices: a.slices
				});
			}
		}
		return this.matches();
	}
	next() {
		return this._active = Se(this._active, this._matches.length), this._activePublic();
	}
	prev() {
		return this._active = ue(this._active, this._matches.length), this._activePublic();
	}
	_activePublic() {
		let e = this._matches[this._active];
		return e ? {
			matchIndex: this._active,
			text: e.text,
			location: { slide: e.slide }
		} : null;
	}
	async _ensureSlideRuns(e) {
		let t = this._slideRuns.get(e);
		if (t) return t;
		let n = await this._collectSlideRuns(e);
		return this._slideRuns.set(e, n), n;
	}
};
//#endregion
//#region packages/pptx/src/types.ts
function wn(e) {
	return e;
}
//#endregion
//#region packages/pptx/src/hyperlink.ts
function Tn(e, t) {
	let n = e !== void 0 && e !== "" ? e : void 0, r = t !== void 0 && t !== "" ? t : void 0;
	if (n === void 0 && r === void 0) return;
	if (r !== void 0) return {
		kind: "internal",
		ref: n ?? r
	};
	let i = n, a = V(i);
	return a !== null && be.includes(a) ? {
		kind: "external",
		url: i
	} : {
		kind: "internal",
		ref: i
	};
}
//#endregion
//#region packages/pptx/src/media-chrome.ts
function En(e, t, n, r, i, a) {
	let o = Math.max(18, Math.min(32, Math.min(r, i) * .25));
	if (e.save(), e.shadowColor = "rgba(0, 0, 0, 0.3)", e.shadowBlur = o * .35, e.fillStyle = "rgba(20, 20, 20, 0.7)", e.beginPath(), e.arc(t, n, o, 0, Math.PI * 2), e.fill(), e.shadowColor = "transparent", e.shadowBlur = 0, e.fillStyle = "#fff", a === "paused") {
		e.beginPath();
		let r = o * .48;
		e.moveTo(t - r * .4, n - r), e.lineTo(t - r * .4, n + r), e.lineTo(t + r * .75, n), e.closePath(), e.fill();
	} else {
		let r = o * .2, i = o * .8, a = o * .15;
		e.fillRect(t - a - r, n - i / 2, r, i), e.fillRect(t + a, n - i / 2, r, i);
	}
	e.restore();
}
//#endregion
//#region packages/pptx/src/bidi-line.ts
var Dn = (e) => {
	let t = e.text;
	return typeof t == "string" ? t : void 0;
}, On = (e) => "isTab" in e;
function kn(e) {
	for (let t of e) {
		let e = Dn(t);
		if (e !== void 0 && M(e)) return !0;
	}
	return !1;
}
function An(e, t) {
	let n = e.length;
	if (n === 0) return {
		order: [],
		rtl: []
	};
	let i = "", a = Array(n), o;
	for (let t = 0; t < n; t++) {
		a[t] = i.length;
		let n = Dn(e[t]) ?? "";
		if (i += n.length > 0 ? n : "￼", On(e[t])) {
			for (o ??= []; o.length < i.length;) o.push(null);
			o[a[t]] = "S";
		}
	}
	if (o) for (; o.length < i.length;) o.push(null);
	let { levels: s, paragraphLevel: c } = d().computeLevels(i, t ? "rtl" : "ltr", o), { order: l, segLevels: u } = r(s, c, a), f = Array(n);
	for (let e = 0; e < n; e++) f[e] = (u[e] & 1) == 1;
	return {
		order: l,
		rtl: f
	};
}
//#endregion
//#region packages/pptx/src/cjk-wrap.ts
function jn(e, t, n, r) {
	if (e.length === 0) return 0;
	let i = t === 0, a = 0, o = t;
	for (let t of e) {
		if (o + t.w > n) {
			if (a > 0 || !i) break;
			o += t.w, a++;
			break;
		}
		o += t.w, a++;
	}
	return a === 0 ? 0 : a >= e.length ? e.length : _(e.map((e) => e.ch), a, r, +!!i);
}
//#endregion
//#region packages/pptx/src/text-justify.ts
var Mn = (e) => /\s/.test(String.fromCodePoint(e));
function Nn(e, t, n, r, i) {
	if (r === "just" && i) return null;
	let a = t - n;
	if (a <= .5) return null;
	let o = Le(e, a, {
		firstContentSi: 0,
		lastDrawnSi: e.length,
		isGapChar: S,
		isWhitespace: Mn,
		seaClusterGaps: r === "thaiDist"
	});
	if (!o) return null;
	let { perGap: s, perSeg: c } = o, l = [];
	for (let t = 0; t < e.length; t++) {
		let n = e[t], r = c.get(t), i = r?.trailingGap ? s : 0, a = r?.splitBefore;
		a && a.length > 0 ? l.push({
			...n,
			jext: i,
			splitBefore: [...a],
			perGap: s
		}) : l.push({
			...n,
			jext: i
		});
	}
	return l;
}
//#endregion
//#region packages/pptx/src/table-border-conflict.ts
function Pn(e) {
	if (!e) return {
		r: 0,
		g: 0,
		b: 0
	};
	let t = e.replace(/^#/, "");
	return t.length < 6 || /[^0-9a-fA-F]/.test(t.slice(0, 6)) ? {
		r: 0,
		g: 0,
		b: 0
	} : {
		r: parseInt(t.slice(0, 2), 16),
		g: parseInt(t.slice(2, 4), 16),
		b: parseInt(t.slice(4, 6), 16)
	};
}
function Fn(e) {
	let t = Pn(e);
	return .299 * t.r + .587 * t.g + .114 * t.b;
}
function In(e, t) {
	if (!e && !t) return null;
	if (!e) return t;
	if (!t) return e;
	if (e.width !== t.width) return e.width > t.width ? e : t;
	let n = Fn(e.color), r = Fn(t.color);
	return n === r || n < r ? e : t;
}
//#endregion
//#region packages/pptx/src/smartart-fallback-contrast.ts
function Ln(e) {
	let t = I(e.length === 8 ? e.slice(0, 6) : e);
	if (!t) return null;
	let n = w(t[0], t[1], t[2]);
	if (e.length !== 8) return n;
	let r = Number.parseInt(e.slice(6, 8), 16);
	if (Number.isNaN(r)) return null;
	let i = r / 255;
	return i * n + (1 - i);
}
function Rn(e) {
	if (!e) return null;
	if (e.fillType === "solid") return Ln(e.color);
	if (e.fillType === "gradient") {
		let t = e.stops.map((e) => ({
			p: Math.min(1, Math.max(0, e.position)),
			l: Ln(e.color)
		})).filter((e) => e.l !== null).sort((e, t) => e.p - t.p);
		if (t.length === 0) return null;
		let n = t[0], r = t[t.length - 1], i = n.l * n.p + r.l * (1 - r.p);
		for (let e = 0; e + 1 < t.length; e++) i += (t[e].l + t[e + 1].l) / 2 * (t[e + 1].p - t[e].p);
		return i;
	}
	return null;
}
function zn(e) {
	return e.name === "SmartArt" && e.id === void 0;
}
function Bn(e, t) {
	let n = Rn(e);
	if (n === null || n >= .5) return null;
	let r = Ln(t.replace(/^#/, ""));
	return r !== null && r >= .5 ? null : "#FFFFFF";
}
//#endregion
//#region packages/pptx/src/tab-layout.ts
function Vn(e, t, n, r, i, a = 0) {
	let o = e.map((e) => e.width), s = (t) => {
		let n = 0;
		for (let r = t; r < e.length && !e[r].isTab; r++) n += o[r];
		return n;
	}, c = n;
	for (let n = 0; n < e.length; n++) {
		if (!e[n].isTab) {
			c += o[n];
			continue;
		}
		let l = null;
		for (let e of t) e.pos > c && (l === null || e.pos < l.pos) && (l = e);
		if (l === null) if (a > 0) l = {
			pos: (Math.floor(c / a) + 1) * a,
			algn: "l"
		};
		else {
			o[n] = i, c += i;
			continue;
		}
		let u = s(n + 1), d = l.algn === "ctr" ? .5 : +(l.algn === "r" || l.algn === "dec"), f = l.pos - u * d;
		f + u > r && (f = r - u), f < c && (f = c), o[n] = f - c, c = f;
	}
	return o;
}
//#endregion
//#region packages/pptx/src/vertical-text.ts
var Hn = () => !1;
function Un(e, t, n) {
	let r = e.textBaseline;
	e.textBaseline = "alphabetic";
	let i = e.measureText(t);
	e.textBaseline = r;
	let a = i.fontBoundingBoxAscent, o = i.fontBoundingBoxDescent;
	return typeof a == "number" && typeof o == "number" && (a !== 0 || o !== 0) ? (a - o) / 2 : .38 * n;
}
function Wn(e, t) {
	let n = e.textAlign, r = e.textBaseline;
	e.textAlign = "center", e.textBaseline = "middle";
	let i = e.measureText(t);
	e.textAlign = n, e.textBaseline = r;
	let a = i.actualBoundingBoxAscent, o = i.actualBoundingBoxDescent;
	return typeof a == "number" && typeof o == "number" ? (a - o) / 2 : 0;
}
function Gn(e, t, n, r, i, o, s = "fill", c = Hn) {
	let l = e.textAlign, u = e.textBaseline, d = s === "stroke" ? e.strokeText.bind(e) : e.fillText.bind(e), f = r - Un(e, t, i), p = 0;
	for (let s of t) {
		let t = s.codePointAt(0) ?? 0, u = D(t), m = e.measureText(s).width + o, h = u === "Tr" ? B(t) : null, g = u === "Tr" && h === null && De(t), _ = u === "U" || u === "Tu" || h !== null || g;
		if (a(t) && c(t)) {
			let t = n + p + m / 2;
			e.save(), e.translate(t, f), e.rotate(-Math.PI / 2), e.textAlign = "center", e.textBaseline = "middle", Te(e, () => d(s, 0, 0)), e.restore();
		} else if (_) {
			let r = h === null && u === "Tu" ? ke(t) : null, a = h === null ? r : h, o = a === null ? s : String.fromCodePoint(a), c = n + p + m / 2, l = r === null ? Wn(e, o) / i : 0;
			e.save(), e.translate(c, f), e.rotate(-Math.PI / 2), e.textAlign = "center", e.textBaseline = "middle", d(o, 0, l * i), e.restore();
		} else if (u === "Tr") {
			let t = n + p + m / 2;
			e.textAlign = "center", e.textBaseline = "middle", d(s, t, f);
		} else e.textAlign = l, e.textBaseline = "alphabetic", d(s, n + p, r);
		p += m;
	}
	e.textAlign = l, e.textBaseline = u;
}
function Kn(e, t, n, r, i, a, o = "fill") {
	Gn(e, t, n, r, i, a, o, (t) => L(e, t));
}
//#endregion
//#region packages/pptx/src/renderer.ts
function Y(e, t) {
	return e * t;
}
var X = Ae;
function qn(e, t, n, r, i, a, o) {
	let { top: s, height: c } = gn(n, i);
	e.fillStyle = a, e.fillRect(t, s, r, c), e.fillStyle = o;
}
function Jn(e) {
	return !e || e.fillType === "none" ? null : e.fillType === "solid" ? X(e.color) : e.fillType === "gradient" ? e.stops.length > 0 ? X(e.stops[0].color) : null : e.fillType === "pattern" ? X(e.fg) : null;
}
function Yn(e, t, n, r, i, a) {
	return O(e, t, n, r, i, a);
}
var Xn = /* @__PURE__ */ new WeakMap();
function Zn(e, t) {
	let n = e.tinted.get(t);
	if (n) return n;
	let r = e.img.naturalWidth || 1, i = e.img.naturalHeight || 1, a = document.createElement("canvas");
	a.width = r, a.height = i;
	let o = a.getContext("2d");
	return o ? (o.drawImage(e.img, 0, 0, r, i), o.globalCompositeOperation = "source-in", o.fillStyle = t, o.fillRect(0, 0, r, i), e.tinted.set(t, a), a) : e.img;
}
function Qn(e) {
	let t = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(e)}`, n = new Image();
	return new Promise((e, r) => {
		n.onload = () => e(n), n.onerror = r, n.src = t;
	});
}
var $n = 256;
function er(e, t, n) {
	let r = Math.max(1, Math.round(t * $n)), i = Math.max(1, Math.round(n * $n));
	return e.replace(/<svg([^>]*?)>/, (e, t) => `<svg${t.replace(/\s(?:width|height)="[^"]*"/g, "")} width="${r}" height="${i}">`);
}
function tr(e) {
	let t = [], n = (e) => {
		if (e) for (let n of e.paragraphs) for (let e of n.runs) e.type === "math" && t.push({
			nodes: e.nodes,
			display: e.display
		});
	};
	for (let t of e.elements) if (t.type === "shape") n(t.textBody);
	else if (t.type === "table") for (let e of t.rows) for (let t of e.cells) n(t.textBody);
	return t;
}
async function nr(e, t) {
	let n = tr(e);
	if (n.length !== 0) {
		await t.loadMathJax();
		for (let e of n) if (!Xn.has(e.nodes)) try {
			let n = await t.mathMLToSvg(m(e.nodes, e.display)), r = await Qn(er(Ye(n.svg, "#000000"), n.widthEm, n.ascentEm + n.descentEm));
			Xn.set(e.nodes, {
				img: r,
				widthEm: n.widthEm,
				ascentEm: n.ascentEm,
				descentEm: n.descentEm,
				tinted: /* @__PURE__ */ new Map()
			});
		} catch {}
	}
}
function rr(e, t) {
	return e ? e.startsWith("+") ? e === "+mj-lt" || e === "+mj-ea" || e === "+mj-cs" ? t.themeMajorFont ?? "sans-serif" : t.themeMinorFont ?? "sans-serif" : e.split(",")[0].trim() || (t.themeMinorFont ?? "sans-serif") : t.themeMinorFont ?? "sans-serif";
}
var ir = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui"
]);
function ar(e) {
	let t = E(e);
	return t === "mono" ? "monospace" : t === "serif" ? "serif" : "sans-serif";
}
var or = {
	calibri: "Carlito",
	"calibri light": "Carlito",
	cambria: "Caladea",
	"cambria math": "Caladea",
	"sakkal majalla": "Noto Naskh Arabic",
	"traditional arabic": "Noto Naskh Arabic",
	"simplified arabic": "Noto Naskh Arabic",
	"arabic typesetting": "Noto Naskh Arabic",
	"univers next arabic": "Noto Sans Arabic"
}, sr = "\"Noto Naskh Arabic\", \"Noto Sans Arabic\"";
function cr(e) {
	if (or[e.toLowerCase()]?.includes("Arabic")) return !0;
	let t = e.toLowerCase();
	return /arabic|naskh|kufi|nastaliq|amiri|scheherazade|lateef|aldhabi|urdu|farsi|العرب|[؀-ۿ]/.test(t);
}
function lr(e) {
	return e.map((e) => `"${e}"`).join(", ");
}
function ur(e) {
	let t = ar(e), n = or[e.toLowerCase()], r = n ? `"${n}", ` : "";
	if (cr(e)) return `"${e}", ${r}${sr}, ${t}`;
	let i = t === "serif" ? "serif" : "sans", a = v(e);
	return `"${e}", ${r}${a ? `${lr(p(a, i))}, ` : ""}${`${lr(i === "serif" ? C : x)}, `}${t}`;
}
function dr(e) {
	return e ? e.kind === "external" ? `e:${e.url}` : `i:${e.ref}` : "";
}
function Z(e, t, n, r, i) {
	let a = t ? "italic " : "", o = e ? "bold " : "", s = rr(r, i);
	return ir.has(s) ? `${a}${o}${n}px ${s}` : `${a}${o}${n}px ${ur(s)}`;
}
function fr(e) {
	return e.bullet.type === "char" || e.bullet.type === "autoNum" || wn(e.bullet).type === "blip";
}
function pr(e, t) {
	return e ? 0 : Math.max(0, t);
}
function mr(e, t, r, i, a, o, s) {
	let c = (t.defaultFontSize ?? 18) * n * o;
	for (let l of t.paragraphs) {
		let u = Y(l.marL, o), d = Y(l.marR, o), f = Y(l.indent, o), p = pr(fr(l), f), m = r - i - a - u - d - p, h = 0;
		for (let r of l.runs) {
			if (r.type !== "text") continue;
			let i = r.fontSize == null ? l.defFontSize == null ? c : l.defFontSize * n * o : r.fontSize * n * o, a = rr(r.fontFamily ?? l.defFontFamily ?? null, s);
			if (e.font = Z(r.bold ?? l.defBold ?? t.defaultBold ?? !1, r.italic ?? l.defItalic ?? t.defaultItalic ?? !1, i, a, s), h += e.measureText(r.text).width, h > m) return !0;
		}
	}
	return !1;
}
function hr(e) {
	for (let t of e) if (S(t.codePointAt(0) ?? 0)) return !0;
	return !1;
}
function Q(e) {
	let t = 0;
	for (let n of e) t++;
	return t;
}
function gr(e, t, r, i, a, c, l, u = !1, d = !1, f = 1, p, m = {
	themeMajorFont: null,
	themeMinorFont: null,
	dpr: 1
}, h = 0) {
	let g = [], _ = () => r - (g.length === 0 ? h : 0), v = { segments: [] }, x = 0, C = !1, w = t.rtl === !0, E = Y(t.marR, c), D = (t.tabStops ?? []).map((e) => ({
		pos: Y(e.pos, c),
		algn: e.algn
	})), O = Y(t.defTabSz ?? 914400, c), A = !1, j = [], M = 0, N = () => w ? E : l + (g.length === 0 ? h : 0), P = (e = 0) => {
		let t = Vn(e > 0 ? [...j, {
			isTab: !1,
			width: e
		}] : j, D, N(), Infinity, M, O), n = 0;
		for (let e of t) n += e;
		return n;
	}, F = (e) => {
		let t = _();
		return Number.isFinite(t) ? A ? P(e) <= t : x + e <= t : !0;
	}, I = () => {
		let e = _();
		if (!A) return e - x;
		if (!Number.isFinite(e)) return Infinity;
		if (P(0) >= e) return 0;
		let t = 0, n = e;
		for (let r = 0; r < 40; r++) {
			let r = (t + n) / 2;
			P(r) <= e ? t = r : n = r;
		}
		return t;
	}, L = (e = !1) => {
		e && (v.endsWithBreak = !0), g.push(v), v = { segments: [] }, x = 0, A = !1, j = [], C = !1;
	}, R = (t, n, r, i, a, o, s, c) => {
		if (!t) return;
		e.font = n;
		let l = c?.letterSpacingPx ?? 0, u = e.measureText(t).width + l * Q(t), d = c?.strikeDouble, f = c?.underlineStyle, p = c?.underlineColor, m = c?.shadow, h = c?.outline, g = c?.highlight, _ = c?.fontFamily, y = c?.hyperlink, b = (e) => !e.math && !e.isTab && e.font === n && e.color === i && e.underline === a && (e.underlineStyle ?? "") === (f ?? "") && (e.underlineColor ?? "") === (p ?? "") && e.strikethrough === o && (e.strikeDouble ?? !1) === (d ?? !1) && (e.letterSpacingPx ?? 0) === l && e.baseline === s && e.shadow === m && e.outline === h && (e.highlight ?? "") === (g ?? "") && (e.fontFamily ?? "") === (_ ?? "") && dr(e.hyperlink) === dr(y);
		x += u, j.push({
			isTab: !1,
			width: u
		});
		let S = v.segments.at(-1);
		S && b(S) ? S.text += t : v.segments.push({
			text: t,
			font: n,
			fontFamily: _,
			sizePx: r,
			color: i,
			underline: a,
			underlineStyle: f,
			underlineColor: p,
			strikethrough: o,
			strikeDouble: d,
			letterSpacingPx: l || void 0,
			baseline: s,
			shadow: m,
			outline: h,
			highlight: g,
			hyperlink: y
		});
	}, z = () => {
		let e = v.segments.at(-1);
		if (!e || e.math) return !1;
		let t = /^(.*\s)(\S+)$/s.exec(e.text), n;
		if (t) e.text = t[1], n = t[2];
		else if (v.segments.length > 1) v.segments.pop(), n = e.text;
		else return !1;
		return L(), R(n, e.font, e.sizePx, e.color, e.underline, e.strikethrough, e.baseline, {
			strikeDouble: e.strikeDouble,
			letterSpacingPx: e.letterSpacingPx,
			underlineStyle: e.underlineStyle,
			underlineColor: e.underlineColor,
			shadow: e.shadow,
			outline: e.outline,
			highlight: e.highlight,
			fontFamily: e.fontFamily
		}), !0;
	};
	for (let r of t.runs) {
		if (r.type === "break") {
			L(!0);
			continue;
		}
		if (r.type === "math") {
			let e = Xn.get(r.nodes), t = r.fontSize == null ? i : r.fontSize * n * c * f, o = e ? e.widthEm * t : 0, s = e ? e.ascentEm * t : 0, l = e ? e.descentEm * t : 0;
			(r.display && x > 0 || !F(o) && x > 0) && L(), j.push({
				isTab: !1,
				width: o
			}), v.segments.push({
				text: "",
				font: `${t}px sans-serif`,
				sizePx: t,
				color: r.color ? X(r.color) : a,
				underline: !1,
				strikethrough: !1,
				math: {
					nodes: r.nodes,
					display: r.display,
					width: o,
					ascent: s,
					descent: l
				}
			}), x += o, r.display && L();
			continue;
		}
		let l = r.fontSize == null ? i : r.fontSize * n * c * f, h = rr(r.fontFamily ?? t.defFontFamily ?? null, m), g = r.fontFamilyEa ? rr(r.fontFamilyEa, m) : null, w = r.fontFamilySym ? rr(r.fontFamilySym, m) : null, E;
		E = r.color ? X(r.color) : r.hyperlink && m.themeHlinkColor ? X(m.themeHlinkColor) : a;
		let D = r.bold ?? t.defBold ?? u, O = r.italic ?? t.defItalic ?? d, N = Z(D, O, l, h, m), P = g ? Z(D, O, l, g, m) : N;
		e.font = N;
		let B = r.caps, V = r.text;
		(B === "all" || B === "small") && (V = V.toUpperCase());
		let H = r.fieldType === "slidenum" && p !== void 0 ? String(p) : V, U = r.underline || r.hyperlink !== void 0, ee = r.strikeDouble === !0, W = r.letterSpacing == null ? 0 : r.letterSpacing * n * c, G = {
			strikeDouble: ee,
			letterSpacingPx: W,
			underlineStyle: r.underlineStyle,
			underlineColor: r.underlineColor ? X(r.underlineColor) : void 0,
			shadow: r.shadow,
			outline: r.outline,
			fontFamily: h,
			highlight: r.highlight ? X(r.highlight) : void 0,
			hyperlink: Tn(r.hyperlink)
		}, te = H.split(/(\s+)/);
		for (let n of te) {
			if (!n) continue;
			if (/^\t+$/.test(n)) {
				A || (e.font = N, M = e.measureText(" ").width);
				for (let e of n) v.segments.push({
					text: "",
					isTab: !0,
					font: N,
					fontFamily: h,
					sizePx: l,
					color: E,
					underline: !1,
					strikethrough: !1
				}), j.push({
					isTab: !0,
					width: 0
				});
				A = !0;
				continue;
			}
			e.font = N;
			let i = e.measureText(n).width, a = /^\s+$/.test(n), c = /[-]/;
			if (c.test(n) && (w != null || Fe(h))) {
				let t = w ?? h;
				for (let i of n) {
					let n = i, a = N;
					if (c.test(i)) {
						let e = Ie(i, t);
						e === i ? a = Z(D, O, l, t, m) : (n = e, a = Z(D, O, l, "sans-serif", m));
					}
					e.font = a;
					let o = e.measureText(n).width;
					!F(o) && x > 0 && L(), R(n, a, l, E, U, r.strikethrough, r.baseline ?? void 0, G);
				}
				continue;
			}
			if (hr(n) && (!k(n) || t.eaLnBrk === !1)) {
				let i = [];
				for (let t of n) {
					let n = S(t.codePointAt(0) ?? 0) && g != null, r = n ? P : N, a = n ? g : h;
					e.font = r, i.push({
						ch: t,
						w: e.measureText(t).width,
						font: r,
						family: a
					});
				}
				if (t.eaLnBrk === !1) {
					let e = i.reduce((e, t) => e + t.w, 0);
					x > 0 && !F(e) && L();
					for (let e of i) R(e.ch, e.font, l, E, U, r.strikethrough, r.baseline ?? void 0, {
						...G,
						fontFamily: e.family
					});
					continue;
				}
				let a = i;
				for (; a.length > 0;) {
					let e = Number.isFinite(_()) ? _() - I() : x, t = jn(a, e, _(), T);
					if (t === 0) {
						if (x > 0) {
							L();
							continue;
						}
						t = 1;
					}
					for (let e = 0; e < t; e++) {
						let t = a[e];
						R(t.ch, t.font, l, E, U, r.strikethrough, r.baseline ?? void 0, {
							...G,
							fontFamily: t.family
						});
					}
					a = a.slice(t), a.length > 0 && L();
				}
				continue;
			}
			if (k(n)) {
				let t = y(n, {
					cjk: !0,
					kinsoku: T
				}), i = g != null && P !== N, a = (e) => i && S(e.codePointAt(0) ?? 0), c = (t) => {
					let n = W * Q(t), r = "", i = null, o = () => {
						r !== "" && (e.font = i ? P : N, n += e.measureText(r).width, r = "");
					};
					for (let e of t) {
						let t = a(e);
						i === null || t === i ? (r += e, i = t) : (o(), r = e, i = t);
					}
					return o(), n;
				}, u = (e) => {
					let t = "", n = null, i = () => {
						if (t === "") return;
						let e = n ? P : N, i = n ? g : h;
						R(t, e, l, E, U, r.strikethrough, r.baseline ?? void 0, {
							...G,
							fontFamily: i
						}), t = "";
					};
					for (let r of e) {
						let e = a(r);
						n === null || e === n ? (t += r, n = e) : (i(), t = r, n = e);
					}
					i();
				}, d = ae(n), f = n.length, p = 0;
				for (; p < f;) {
					let e = I(), r = s(n, t, p, e, c, d);
					if (r <= p) {
						if (x > 0) {
							L();
							continue;
						}
						let i = t.find((e) => e > p) ?? f, a = n.slice(p, i), l = o(a), u = s(a, l, 0, e, c, d);
						u <= 0 && (u = l.length > 0 ? l[0] : a.length), r = p + u;
					}
					u(n.slice(p, r)), p = r, p < f && L();
				}
				continue;
			}
			if (F(i)) R(n, N, l, E, U, r.strikethrough, r.baseline ?? void 0, G), a && (C = !0);
			else if (a) x > 0 && L();
			else if (i > _()) {
				x > 0 && L();
				for (let t of n) {
					e.font = N;
					let n = e.measureText(t).width;
					!F(n) && x > 0 && L(), R(t, N, l, E, U, r.strikethrough, r.baseline ?? void 0, G);
				}
			} else if (!C) R(n, N, l, E, U, r.strikethrough, r.baseline ?? void 0, G);
			else {
				let e = v.segments.at(-1)?.text ?? "", t = n.codePointAt(0), i = [...e].at(-1)?.codePointAt(0), a = /\S$/u.test(e) && /^\S/u.test(n) && i !== 8203 && t !== 8203, o = t !== void 0 && T.lineStartForbidden.has(t) && a, s = i !== void 0 && t !== void 0 && a && !k(e) && !k(n) && b(i, t);
				(o || s) && z() || L(), R(n, N, l, E, U, r.strikethrough, r.baseline ?? void 0, G);
			}
		}
	}
	return g.push(v), g;
}
async function _r(e, t, r, i, a, o) {
	if (t && t.fillType === "image") {
		if (e.fillStyle = "#FFFFFF", e.fillRect(0, 0, r, i), !t.imagePath || !t.mimeType || !o) return;
		try {
			let s = await We(t.imagePath, t.mimeType, t.duotone, o, {
				widthPt: r / a / n,
				heightPt: i / a / n
			});
			if (!s) return;
			if (e.save(), e.beginPath(), e.rect(0, 0, r, i), e.clip(), t.alpha != null && (e.globalAlpha = t.alpha), t.tile) br(e, s, t.tile, r, i, a);
			else {
				let n = t.fillRect ?? {}, a = n.l ?? 0, o = n.t ?? 0, c = n.r ?? 0, l = n.b ?? 0, u = a * r, d = o * i, f = r * (1 - a - c), p = i * (1 - o - l);
				e.drawImage(s, u, d, f, p);
			}
			e.restore();
		} catch {}
		return;
	}
	e.fillStyle = Yn(t, e, 0, 0, r, i) ?? "#FFFFFF", e.fillRect(0, 0, r, i);
}
var vr = 9525;
function yr(e, t, n, r, i) {
	let a;
	a = e === "t" || e === "ctr" || e === "b" ? (t - r) / 2 : e === "tr" || e === "r" || e === "br" ? t - r : 0;
	let o;
	return o = e === "l" || e === "ctr" || e === "r" ? (n - i) / 2 : e === "bl" || e === "b" || e === "br" ? n - i : 0, {
		ax: a,
		ay: o
	};
}
function br(e, t, n, r, i, a) {
	let o = t.width * vr * n.sx * a, s = t.height * vr * n.sy * a;
	if (!(o > 0) || !(s > 0)) return;
	let l = n.flip === "x" || n.flip === "xy", u = n.flip === "y" || n.flip === "xy", d = c(o * (l ? 2 : 1), s * (u ? 2 : 1));
	if (!d) return;
	let f = d.getContext("2d");
	if (!f) return;
	let p = (e, n, r, i) => {
		f.save(), f.translate(e + (r ? o : 0), n + (i ? s : 0)), f.scale(r ? -1 : 1, i ? -1 : 1), f.drawImage(t, 0, 0, o, s), f.restore();
	};
	p(0, 0, !1, !1), l && p(o, 0, !0, !1), u && p(0, s, !1, !0), l && u && p(o, s, !0, !0);
	let m = e.createPattern(d, "repeat");
	if (!m) return;
	let { ax: h, ay: g } = yr(n.algn, r, i, o, s), _ = h + Y(n.tx, a), v = g + Y(n.ty, a);
	typeof m.setTransform == "function" && typeof DOMMatrix < "u" ? (m.setTransform(new DOMMatrix().translateSelf(_, v)), e.fillStyle = m, e.fillRect(0, 0, r, i)) : (e.save(), e.translate(_, v), e.fillStyle = m, e.fillRect(-_, -v, r, i), e.restore());
}
function xr(e, t, n) {
	if (!t) return;
	let r = t.dir * Math.PI / 180, i = Y(t.dist, n);
	e.shadowColor = X(t.color, t.alpha), e.shadowBlur = Y(t.blur, n), e.shadowOffsetX = Math.cos(r) * i, e.shadowOffsetY = Math.sin(r) * i;
}
function Sr(e, t, n) {
	t && (e.shadowColor = X(t.color, t.alpha), e.shadowBlur = Y(t.radius, n), e.shadowOffsetX = 0, e.shadowOffsetY = 0);
}
function Cr(e) {
	e.shadowColor = "transparent", e.shadowBlur = 0, e.shadowOffsetX = 0, e.shadowOffsetY = 0;
}
var wr = 8, Tr = 1, Er = 1, Dr = 256;
function Or(e, t, n, r, i, a, o, s, l, u, d, f, p, m, h) {
	if (r <= 0) return;
	let g = e.measureText(t), _ = g.actualBoundingBoxAscent > 0 ? g.actualBoundingBoxAscent : r, v = g.actualBoundingBoxDescent > 0 ? g.actualBoundingBoxDescent : r * .25, y = g.actualBoundingBoxLeft > 0 ? g.actualBoundingBoxLeft : 0, b = g.actualBoundingBoxRight > 0 ? g.actualBoundingBoxRight : r, x = r * u * i, S = Math.min(Dr, Math.max(1, Math.round(x / wr))), C = (e) => jr(e, a, r, o, s, l, d, f), w = C(S), T = Nr(w, a, o, s, l, d, f, u, i, -_, v);
	for (; T > Er && S < Dr;) {
		let e = Math.min(Dr, S * 2), t = C(e), n = Nr(t, a, o, s, l, d, f, u, i, -_, v);
		if (n >= T * .75) {
			w = t;
			break;
		}
		S = e, w = t, T = n;
	}
	let E = 1e4, D = Tr / (u * i), O = w.length - 1, k = (e, t, n) => e === 0 ? -E : t - n - D, A = (e, t, n) => e === O ? E : t - n + D, j = (e, r) => {
		e.fillStyle = r;
		for (let r = 0; r <= O; r++) {
			let { s0: i, s1: a, g: o } = w[r], s = (i + a) / 2;
			e.save(), e.translate(p + o.x, m + o.y), e.rotate(o.angle), o.shear !== 0 && e.transform(1, 0, o.shear, 1, 0, 0), (u !== 1 || o.vScale !== 1) && e.scale(u, o.vScale), e.beginPath();
			let c = k(r, i, s), l = A(r, a, s);
			e.rect(c, -E, l - c, 2 * E), e.clip(), e.fillText(t, -s + n / 2, 0), e.restore();
		}
	}, M = kr(h), N = typeof e.globalAlpha == "number" ? e.globalAlpha : 1;
	if (M >= 1 && N >= 1) {
		j(e, h);
		return;
	}
	if (M <= 0 || N <= 0) return;
	let P = typeof e.getTransform == "function" ? e.getTransform() : null;
	if (!P) {
		j(e, h);
		return;
	}
	let F = Infinity, I = Infinity, L = -Infinity, R = -Infinity;
	for (let e = 0; e <= O; e++) {
		let { s0: t, s1: r, g: i } = w[e], a = (t + r) / 2, o = -a + n / 2, s = Math.max(k(e, t, a), o - y), c = Math.min(A(e, r, a), o + b);
		if (!(c <= s)) for (let [e, t] of [
			[s, -_],
			[c, -_],
			[s, v],
			[c, v]
		]) {
			let n = Mr(i, u, e, t), r = p + n.x, a = m + n.y, o = P.a * r + P.c * a + P.e, s = P.b * r + P.d * a + P.f;
			o < F && (F = o), o > L && (L = o), s < I && (I = s), s > R && (R = s);
		}
	}
	if (!(L > F && R > I)) return;
	let z = Math.floor(F - 2), B = Math.floor(I - 2), V = c(Math.ceil(L + 2) - z, Math.ceil(R + 2) - B), H = V ? V.getContext("2d") : null;
	if (!V || !H) {
		j(e, h);
		return;
	}
	H.font = e.font, H.textAlign = "left", H.textBaseline = "alphabetic", H.setTransform(P.a, P.b, P.c, P.d, P.e - z, P.f - B), j(H, Ar(h)), e.save(), e.setTransform(1, 0, 0, 1, 0, 0), e.globalAlpha = N * M, e.drawImage(V, z, B), e.restore();
}
function kr(e) {
	let t = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/i.exec(e);
	if (!t) return 1;
	let n = parseFloat(t[1]);
	return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}
function Ar(e) {
	let t = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(e);
	return t ? `rgb(${t[1]}, ${t[2]}, ${t[3]})` : e;
}
function jr(e, t, n, r, i, a, o, s) {
	let c = Array(e);
	for (let l = 0; l < e; l++) {
		let u = l / e * n, d = (l + 1) / e * n;
		c[l] = {
			s0: u,
			s1: d,
			g: lt(t, (r + (u + d) / 2) / i * a, o, s)
		};
	}
	return c;
}
function Mr(e, t, n, r) {
	let i = n * t, a = r * e.vScale, o = i + e.shear * a, s = Math.cos(e.angle), c = Math.sin(e.angle);
	return {
		x: e.x + s * o - c * a,
		y: e.y + c * o + s * a
	};
}
function Nr(e, t, n, r, i, a, o, s, c, l, u) {
	let d = 0;
	for (let f of e) {
		let e = (f.s0 + f.s1) / 2;
		for (let p of [f.s0, f.s1]) {
			let m = lt(t, (n + p) / r * i, a, o);
			for (let t of [l, u]) {
				let n = Mr(m, s, 0, t), r = Mr(f.g, s, p - e, t), i = Math.hypot(r.x - n.x, r.y - n.y) * c;
				i > d && (d = i);
			}
		}
	}
	return d;
}
function Pr(e, t, r, i, a, o, s, c, l, u, d) {
	let f = a, p = o, m = Math.max(1, s), h = Math.max(1, c), g = at(r, i, m, h);
	if (!g) return;
	let _ = t.defaultBold ?? !1, v = t.defaultItalic ?? !1, y = (t.defaultFontSize ?? 18) * n * l, b = [];
	for (let r of t.paragraphs) {
		let t = gr(e, r, Infinity, r.defFontSize == null ? y : r.defFontSize * n * l, r.defColor ? X(r.defColor) : u, l, 0, _, v, 1, void 0, d, 0);
		for (let e of t) b.push(e);
	}
	if (b.length === 0) return;
	e.save(), e.textAlign = "left", e.textBaseline = "alphabetic";
	let x = -1, S = () => {
		if (x >= 0) return x;
		let t = typeof e.getTransform == "function" ? e.getTransform() : null, n = t ? Math.abs(t.a * t.d - t.b * t.c) : 1;
		return x = n > 0 ? Math.sqrt(n) : 1, x;
	}, C = b.length;
	for (let t = 0; t < C; t++) {
		let n = b[t], r = t / C, i = (t + 1) / C, a = 0, o = 0, s = 0, c = 0;
		for (let t of n.segments) {
			if (t.math) {
				a += t.math.width, o = Math.max(o, t.sizePx), s = Math.max(s, t.math.ascent), c = Math.max(c, t.math.descent);
				continue;
			}
			e.font = t.font;
			let n = t.letterSpacingPx ?? 0, r = e.measureText(t.text);
			a += r.width + n * Q(t.text), o = Math.max(o, t.sizePx), r.actualBoundingBoxAscent > 0 && (s = Math.max(s, r.actualBoundingBoxAscent)), r.actualBoundingBoxDescent > 0 && (c = Math.max(c, r.actualBoundingBoxDescent));
		}
		if (a <= 0) continue;
		let l = s + c > 0 ? s + c : o, u = g.singleEdge ? .8 : l > 0 ? s / l : .8, d = g.singleEdge ? 1 : m / a, _ = g.singleEdge ? h : l / (i - r), v = ct(g, a), y = 0;
		for (let t of n.segments) {
			if (t.math) {
				y += t.math.width;
				continue;
			}
			e.font = t.font, e.fillStyle = t.color;
			let n = t.letterSpacingPx ?? 0, o = [...t.text];
			for (let s of o) {
				let o = e.measureText(s).width + n, c = r + u * (i - r);
				if (!g.singleEdge && o > 0) {
					Or(e, s, n, o, S(), g, y, a, v, d, _, c, f, p, t.color), y += o;
					continue;
				}
				let l = lt(g, (y + o / 2) / a * v, _, c);
				e.save(), e.translate(f + l.x, p + l.y), e.rotate(l.angle), l.shear !== 0 && e.transform(1, 0, l.shear, 1, 0, 0), (d !== 1 || l.vScale !== 1) && e.scale(d, l.vScale), e.fillText(s, -o / 2 + n / 2, 0), e.restore(), y += o;
			}
		}
	}
	e.restore();
}
function Fr(e, t, n, r, i, a, o) {
	let s = Math.min(r, i);
	switch (e) {
		case "rightarrow":
		case "leftarrow": {
			let c = Math.min(Math.max(a ?? 5e4, 0), 1e5), l = s * Math.min(Math.max(o ?? 5e4, 0), 1e5) / 1e5, u = i * c / 2e5, d = n + i / 2 - u, f = 2 * u, p = Math.max(0, r - l);
			return e === "rightarrow" ? {
				tx: t,
				ty: d,
				tw: p,
				th: f
			} : {
				tx: t + l,
				ty: d,
				tw: p,
				th: f
			};
		}
		case "roundrect": {
			let e = s * Math.min(Math.max(a ?? 16667, 0), 1e5) / 1e5 * (1 - 1 / Math.SQRT2);
			return {
				tx: t + e,
				ty: n + e,
				tw: Math.max(0, r - 2 * e),
				th: Math.max(0, i - 2 * e)
			};
		}
		default: return null;
	}
}
function Ir(e, t) {
	return e.defaultTextColor ? X(e.defaultTextColor) : t.smartArtFallbackTextColor != null && zn(e) ? t.smartArtFallbackTextColor : null;
}
function Lr(e, t, n, r = "#000000", i, a = {
	themeMajorFont: null,
	themeMinorFont: null,
	dpr: 1
}, o, s) {
	let c = Y(t.x, n), l = Y(t.y, n), u = Y(t.width, n), d = Y(t.height, n), f = o && t.id !== void 0 ? (e) => o({
		...e,
		shapeId: t.id
	}) : o;
	if (d === 0 && t.textBody?.verticalAnchor === "b") {
		if (t.stroke && (e.save(), $(e, t.stroke, n), e.beginPath(), e.moveTo(c, l), e.lineTo(c + u, l), e.stroke(), e.restore()), t.textBody) {
			let o = Ir(t, a);
			Ur(e, t.textBody, c, l, u, d, n, o, t.rotation, t.flipH, t.flipV, r, i, a, f, !1, s);
		}
		return;
	}
	let p = t.scene3d && Dt(t.scene3d.camera) ? t.scene3d : null;
	if (p && u > 0 && d > 0) {
		let o = e.getTransform(), s = Math.abs(o.a * o.d - o.b * o.c), f = s > 0 ? Math.sqrt(s) : 1, m = Wr(t.sp3d, t.scene3d?.lightRig, t.sp3d?.prstMaterial, n, f), h = Gr(t.sp3d, p.camera, u, d, n, f);
		e.save(), (t.rotation !== 0 || t.flipH || t.flipV) && (e.translate(c + u / 2, l + d / 2), e.rotate(t.rotation * Math.PI / 180), t.flipH && e.scale(-1, 1), t.flipV && e.scale(1, -1), e.translate(-(c + u / 2), -(l + d / 2)));
		let g = {
			...t,
			x: 0,
			y: 0,
			rotation: 0,
			flipH: !1,
			flipV: !1,
			scene3d: void 0
		};
		if (Kr(e, p.camera, c, l, u, d, (e) => {
			Lr(e, g, n, r, i, a, void 0);
		}, {
			bevels: m,
			extrusion: h ?? void 0,
			edgePadCss: (t.stroke ? t.stroke.width * n / 2 : 0) + (t.sp3d?.contourW ? t.sp3d.contourW * n : 0) + (h ? Math.hypot(h.offsetX, h.offsetY) / f : 0) + 2
		})) {
			e.restore();
			return;
		}
		e.restore();
	}
	e.save(), (t.rotation !== 0 || t.flipH || t.flipV) && (e.translate(c + u / 2, l + d / 2), e.rotate(t.rotation * Math.PI / 180), t.flipH && e.scale(-1, 1), t.flipV && e.scale(1, -1), e.translate(-(c + u / 2), -(l + d / 2)));
	let m = t.geometry.toLowerCase(), h = Yn(t.fill, e, c, l, u, d);
	xr(e, t.shadow ?? null, n), t.shadow || Sr(e, t.glow ?? null, n);
	let g = new Set([
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
	]), _ = new Set([
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
	]), v = (e) => _.has(e) || e === "line" || e === "straightconnector1" || e.startsWith("bentconnector"), y = !t.custGeom && he(m), b = (e, r) => {
		let i = r ?? h, a = r ? null : t.stroke ? () => {
			$(e, t.stroke, n), e.stroke();
		} : null, o = () => Cr(e);
		if (y && !r) {
			le(e, m, c, l, u, d, [
				t.adj,
				t.adj2,
				t.adj3,
				t.adj4,
				t.adj5,
				t.adj6,
				t.adj7,
				t.adj8
			], i, a, o, v(m) ? { skipTrailingStroke: !0 } : void 0);
			return;
		}
		e.beginPath(), t.custGeom && t.custGeom.length > 0 ? Rr(e, t.custGeom, c, l, u, d) : Pe(e, m, c, l, u, d, t.adj, t.adj2, t.adj3, t.adj4), i && m !== "arc" && (e.fillStyle = i, m === "donut" || m === "smileyface" || m === "frame" ? e.fill("evenodd") : e.fill(), r || o()), a && a();
	}, x = e.canvas.width || 0, S = e.canvas.height || 0, C = e.getTransform(), w = Math.abs(C.a * C.d - C.b * C.c), T = w > 0 ? Math.sqrt(w) : 1, E = {
		x: c * T,
		y: l * T,
		w: u * T,
		h: d * T
	}, D = n * T, O = (e) => {
		e.setTransform(C);
	};
	if (t.reflection && x > 0 && S > 0 && (e.save(), e.setTransform(new DOMMatrix()), gt(e, (e) => {
		O(e), b(e);
	}, E, t.reflection, D, x, S), e.restore()), t.softEdge && x > 0 && S > 0 ? (e.save(), e.setTransform(new DOMMatrix()), ht(e, (e) => {
		O(e), b(e);
	}, E, t.softEdge, D, x, S, (e) => {
		O(e), b(e, "#000");
	}), e.restore()) : b(e), t.innerShadow && x > 0 && S > 0 && (e.save(), e.setTransform(new DOMMatrix()), mt(e, (e) => {
		O(e), b(e, "#000");
	}, E, t.innerShadow, D, x, S), e.restore()), t.stroke && (g.has(m) || _.has(m))) {
		let r = G(m, c, l, u, d, [
			t.adj,
			t.adj2,
			t.adj3,
			t.adj4,
			t.adj5,
			t.adj6,
			t.adj7,
			t.adj8
		]);
		if (r) {
			let i = t.stroke.cmpd, a = m === "line" || m === "straightconnector1";
			if (v(m) && r.vertices.length >= 2 && !(i && a)) {
				let i = r.vertices.map((e) => ({
					x: e.x,
					y: e.y
				}));
				if (t.stroke.tailEnd) {
					let e = Be(t.stroke.tailEnd, t.stroke, n);
					i[i.length - 1] = He(i[i.length - 1], i[i.length - 2], e);
				}
				if (t.stroke.headEnd) {
					let e = Be(t.stroke.headEnd, t.stroke, n);
					i[0] = He(i[0], i[1], e);
				}
				$(e, t.stroke, n), e.beginPath(), e.moveTo(i[0].x, i[0].y);
				for (let t = 1; t < i.length; t++) e.lineTo(i[t].x, i[t].y);
				e.stroke();
			}
			i && a && Qr(e, r.start, r.end, t.stroke, i, n), t.stroke.tailEnd && Ne(e, r.end.x, r.end.y, r.end.angle, t.stroke.tailEnd, t.stroke, n), t.stroke.headEnd && Ne(e, r.start.x, r.start.y, r.start.angle, t.stroke.headEnd, t.stroke, n);
		}
	} else if (t.stroke && t.custGeom && t.custGeom.length > 0 && (t.stroke.headEnd && t.stroke.headEnd.type !== "none" || t.stroke.tailEnd && t.stroke.tailEnd.type !== "none")) {
		let { start: r, end: i } = Re(t.custGeom);
		r && t.stroke.headEnd && t.stroke.headEnd.type !== "none" && Ne(e, c + r.x * u, l + r.y * d, Math.atan2(r.dy * d, r.dx * u), t.stroke.headEnd, t.stroke, n), i && t.stroke.tailEnd && t.stroke.tailEnd.type !== "none" && Ne(e, c + i.x * u, l + i.y * d, Math.atan2(i.dy * d, i.dx * u), t.stroke.tailEnd, t.stroke, n);
	}
	if (t.textBody) {
		let o = Ir(t, a);
		if (e.save(), t.flipH || t.flipV) {
			let n = c + u / 2, r = l + d / 2;
			e.translate(n, r), t.flipH && e.scale(-1, 1), t.flipV && e.scale(1, -1), e.translate(-n, -r);
		}
		let p = c, h = l, g = u, _ = d;
		if (t.textRect) p = Y(t.textRect.x, n), h = Y(t.textRect.y, n), g = Y(t.textRect.width, n), _ = Y(t.textRect.height, n);
		else if (m === "ellipse") {
			let e = u * (1 - 1 / Math.SQRT2) / 2, t = d * (1 - 1 / Math.SQRT2) / 2;
			p = c + e, h = l + t, g = u / Math.SQRT2, _ = d / Math.SQRT2;
		} else {
			let e = Fr(m, c, l, u, d, t.adj, t.adj2);
			e && (p = e.tx, h = e.ty, g = e.tw, _ = e.th);
		}
		Ur(e, t.textBody, p, h, g, _, n, o, t.rotation, !1, !1, r, i, a, f, !1, s), e.restore();
	}
	e.restore();
}
var Rr = Ue;
function zr(e, t) {
	let n = `${e}`, r = e >= 1 && e <= 26 ? String.fromCharCode(96 + e) : n, i = e >= 1 && e <= 26 ? String.fromCharCode(64 + e) : n, a = Br(e).toLowerCase(), o = Br(e), s = n.replace(/[0-9]/g, (e) => String.fromCharCode(65296 + (e.charCodeAt(0) - 48)));
	switch (t) {
		case "arabicPlain": return n;
		case "arabicPeriod": return `${n}.`;
		case "arabicParenR": return `${n})`;
		case "arabicParenBoth": return `(${n})`;
		case "arabicDbPlain": return s;
		case "arabicDbPeriod": return `${s}.`;
		case "alphaLcPlain": return r;
		case "alphaLcPeriod": return `${r}.`;
		case "alphaLcParenR": return `${r})`;
		case "alphaLcParenBoth": return `(${r})`;
		case "alphaUcPlain": return i;
		case "alphaUcPeriod": return `${i}.`;
		case "alphaUcParenR": return `${i})`;
		case "alphaUcParenBoth": return `(${i})`;
		case "romanLcPlain": return a;
		case "romanLcPeriod": return `${a}.`;
		case "romanLcParenR": return `${a})`;
		case "romanLcParenBoth": return `(${a})`;
		case "romanUcPlain": return o;
		case "romanUcPeriod": return `${o}.`;
		case "romanUcParenR": return `${o})`;
		case "romanUcParenBoth": return `(${o})`;
		default: return `${n}.`;
	}
}
function Br(e) {
	let t = [
		1e3,
		900,
		500,
		400,
		100,
		90,
		50,
		40,
		10,
		9,
		5,
		4,
		1
	], n = [
		"M",
		"CM",
		"D",
		"CD",
		"C",
		"XC",
		"L",
		"XL",
		"X",
		"IX",
		"V",
		"IV",
		"I"
	], r = "";
	for (let i = 0; i < t.length; i++) for (; e >= t[i];) r += n[i], e -= t[i];
	return r;
}
function Vr(e) {
	for (let t of e.runs) if (t.type === "text" && t.text !== "" || t.type === "math") return !0;
	return !1;
}
function Hr(e, t) {
	let n = Vr(e);
	if (e.bullet.type === "char") return t.clear(), n ? Ie(e.bullet.char, e.bullet.fontFamily ?? null) : "";
	if (e.bullet.type === "autoNum") {
		if (!n) return "";
		let r = e.lvl;
		return t.has(r) ? t.set(r, t.get(r) + 1) : t.set(r, e.bullet.startAt ?? 1), zr(t.get(r), e.bullet.numType);
	}
	return t.clear(), "";
}
function Ur(e, t, r, i, a, o, s, c = null, l = 0, d = !1, f = !1, p = "#000000", m, h = {
	themeMajorFont: null,
	themeMinorFont: null,
	dpr: 1
}, g, _ = !1, v, y = !1) {
	let b = t.vert === "vert" || t.vert === "eaVert", x = t.vert === "vert270";
	if (b || x) {
		let n = r + a / 2, u = i + o / 2, d = b ? 90 : -90, f = g ? (e) => g({
			...e,
			inShapeX: e.inShapeX - o / 2 + a / 2,
			inShapeY: e.inShapeY - a / 2 + o / 2,
			shapeX: r,
			shapeY: i,
			shapeW: a,
			shapeH: o,
			rotation: l,
			textBodyRotation: d
		}) : void 0;
		if (_) return a;
		e.save(), e.translate(n, u), e.rotate(x ? -Math.PI / 2 : Math.PI / 2), Ur(e, {
			...t,
			vert: "horz"
		}, -o / 2, -a / 2, o, a, s, c, 0, !1, !1, p, m, h, f, !1, v, t.vert === "eaVert"), e.restore();
		return;
	}
	let S = t.textWarp;
	if (!_ && S && et(S.preset)) {
		Pr(e, t, S.preset, S.adj ?? [], r, i, a, o, s, c ?? p, h);
		return;
	}
	let C = Y(t.lIns, s), w = Y(t.rIns, s), T = Y(t.tIns, s), E = Y(t.bIns, s), D = t.wrap !== "none", O = t.autoFit === "sp" ? D && mr(e, t, a, C, w, s, h) : D, k = Math.max(1, t.numCol ?? 1), A = Y(t.spcCol ?? 0, s), j = t.defaultBold ?? !1, M = t.defaultItalic ?? !1, N = c ?? p, P = (i) => {
		let o = (t.defaultFontSize ?? 18) * n * s * i, c = [], l = 0, u = /* @__PURE__ */ new Map();
		for (let d = 0; d < t.paragraphs.length; d++) {
			let f = t.paragraphs[d], p = Y(f.marL, s), g = Y(f.marR, s), _ = Y(f.indent, s), v = f.defFontSize == null ? o : f.defFontSize * n * s * i, y = f.defColor ? X(f.defColor) : N, b = fr(f), x = (() => {
				for (let e of f.runs) if (e.type === "text" && e.fontSize != null) return e.fontSize;
				return null;
			})(), S = x == null ? v : x * n * s * i, T = (() => {
				for (let e of f.runs) if (e.type === "text" && e.color) return e.color;
				return null;
			})(), E = T ? X(T) : y, D = "", P = Z(!1, !1, S, "sans-serif", h), F = E, I = null;
			D = Hr(f, u);
			let L = wn(f.bullet);
			if (L.type === "char") {
				let e = L;
				P = Z(!1, !1, e.sizePts == null ? e.sizePct == null ? S : S * (e.sizePct / 100) : e.sizePts * n * s * i, D === e.char ? rr(e.fontFamily ?? null, h) : "sans-serif", h), F = e.color ? X(e.color) : E;
			} else if (L.type === "autoNum") P = Z(!1, !1, S, "sans-serif", h), F = L.color ? X(L.color) : E;
			else if (L.type === "blip") {
				let e = L, t = e.sizePts == null ? e.sizePct == null ? S : S * (e.sizePct / 100) : e.sizePts * n * s * i;
				I = {
					imagePath: e.imagePath,
					mimeType: e.mimeType,
					sizePx: t
				};
			}
			let R = k > 1 ? (a - C - w - (k - 1) * A) / k : a - C - w, z = r + C + p, B = r + C + p + _, V = R - p - g, H = gr(e, f, O ? V : Infinity, v, y, s, p, j, M, i, m, h, pr(b, _)), U = f.spaceBefore == null ? 0 : f.spaceBefore / 100 * n * s * i, ee = f.spaceAfter == null ? 0 : f.spaceAfter / 100 * n * s * i;
			for (let r = 0; r < H.length; r++) {
				let i = H[r], a = r === 0, o = r === H.length - 1, u = 0, p = 0;
				for (let e of i.segments) {
					let t = e.math ? Math.max(e.sizePx, (e.math.ascent + e.math.descent) / 1.2) : e.sizePx;
					if (t > u && (u = t), !e.math) {
						let t = fe(e.fontFamily, e.sizePx);
						t > p && (p = t);
					}
				}
				if (u === 0 && (u = v), a && D) {
					e.font = P;
					let t = e.measureText("M"), n = t.actualBoundingBoxAscent + t.actualBoundingBoxDescent;
					n > u && (u = n);
				}
				a && I && I.sizePx > u && (u = I.sizePx);
				let m = Math.max(u * 1.2, p), h;
				h = f.spaceLine ? f.spaceLine.type === "pct" ? m * (f.spaceLine.val / 1e5) : f.spaceLine.val * n * s : m, t.autoFit === "norm" && t.lnSpcReduction != null && f.spaceLine?.type !== "pts" && (h *= 1 - t.lnSpcReduction);
				let g = h + (o ? ee : 0), y = a && d > 0 ? U : 0, x = a ? pr(b, _) : 0, S = i.segments.some((e) => e.text && e.text.length > 0 || e.math != null), C = a && S ? I : null;
				c.push({
					line: i,
					linePx: g,
					lineHeight: h,
					topGapPx: y,
					textXOffset: x,
					bulletLabel: a ? D : "",
					bulletFont: P,
					bulletColor: F,
					bulletX: B,
					bulletImage: C,
					textX: z,
					textMaxW: V,
					alignment: f.alignment,
					isLastLine: o,
					para: f
				}), l += g + y;
			}
		}
		return {
			allLines: c,
			totalHeight: l
		};
	}, { allLines: F, totalHeight: I } = P(1);
	if (t.autoFit === "norm") if (t.fontScale != null && t.fontScale > 0) t.fontScale < 1 && ({allLines: F, totalHeight: I} = P(t.fontScale));
	else {
		let e = o - T - E;
		if (I > e && e > 0) {
			let t = .1, n = 1;
			for (let r = 0; r < 6; r++) {
				let r = (t + n) / 2;
				P(r).totalHeight <= e ? t = r : n = r;
			}
			({allLines: F, totalHeight: I} = P(t));
		}
	}
	if (_) return T + I + E;
	let L = t.verticalAnchor ?? "t", R = i, z;
	o === 0 && L === "b" ? (z = T + I + E, R = i - z) : z = t.autoFit === "sp" ? Math.max(o, T + I + E) : o;
	let B, V = Math.max(0, z - T - E);
	B = L === "ctr" ? R + T + (V - I) / 2 : L === "b" ? R + z - E - I : R + T, e.save(), e.textAlign = "left", e.textBaseline = "alphabetic";
	let H = B, U = k > 1 ? (a - C - w - (k - 1) * A) / k + A : 0, ee = Math.max(0, z - T - E), W = o === 0 || I <= ee + .5, G = k > 1 && !W ? Math.ceil(F.length / k) : F.length, te = 0, ne = 0;
	for (let n of F) {
		let { line: c, linePx: d, lineHeight: f, topGapPx: p, textXOffset: m, bulletLabel: _, bulletFont: b, bulletColor: x, bulletImage: S, alignment: C, isLastLine: w } = n;
		k > 1 && te < k - 1 && ne >= G && (te++, ne = 0, B = H), B += p, ne++;
		let T = (t.rtlCol ? k - 1 - te : te) * U, E = n.textX + T, D = n.bulletX + T, O = n.textMaxW, A = n.para.rtl === !0, j = A || kn(c.segments), M = c.segments.some((e) => e.isTab);
		if (M) {
			let t = Y(n.para.marL, s), r = Y(n.para.marR, s), i = A ? r : t + m, a = O + t + r;
			e.font = c.segments.find((e) => e.isTab).font;
			let o = e.measureText(" ").width, l = Vn(c.segments.map((t) => {
				if (t.isTab) return {
					isTab: !0,
					width: 0
				};
				if (t.math) return {
					isTab: !1,
					width: t.math.width
				};
				e.font = t.font;
				let n = t.letterSpacingPx ?? 0;
				return {
					isTab: !1,
					width: t.text ? e.measureText(t.text).width + n * Q(t.text) : 0
				};
			}), (n.para.tabStops ?? []).map((e) => ({
				pos: Y(e.pos, s),
				algn: e.algn
			})), i, a, o, Y(n.para.defTabSz ?? 914400, s));
			for (let e = 0; e < c.segments.length; e++) c.segments[e].isTab && (c.segments[e].tabWidthPx = l[e]);
		}
		let N = 0, P = f * .8;
		for (let t of c.segments) {
			if (t.isTab) {
				N += t.tabWidthPx ?? 0;
				continue;
			}
			if (t.math) {
				N += t.math.width, P = Math.max(P, t.math.ascent);
				continue;
			}
			e.font = t.font;
			let n = e.measureText(t.text || "M"), r = t.letterSpacingPx ?? 0;
			N += t.text ? n.width + r * Q(t.text) : 0, n.actualBoundingBoxAscent > 0 && (P = Math.max(P, n.actualBoundingBoxAscent));
		}
		let F = B + P, I = E + O, L = 0, R = null;
		if (j && A) {
			if (_) e.font = b, L = e.measureText(_).width;
			else if (S && v && (R = xe(S.imagePath, v), R)) {
				let e = S.sizePx;
				L = R.height > 0 ? e * (R.width / R.height) : e;
			}
		}
		if (_) if (e.font = b, e.fillStyle = x, j && A) {
			let t = e.direction;
			e.direction = "rtl", e.fillText(_, I - L, F), e.direction = t;
		} else e.fillText(_, D, F);
		if (S && v) {
			let t = xe(S.imagePath, v);
			if (t) {
				let n = S.sizePx, r = t.height > 0 ? n * (t.width / t.height) : n, i = F - n;
				j && A ? e.drawImage(t, I - r, i, r, n) : e.drawImage(t, D, i, r, n);
			}
		}
		let z = E + m, V;
		V = M ? A ? E + O - L - N : z : C === "ctr" ? z + (O - m - N) / 2 : C === "r" ? E + O - L - N : z;
		let ee = C === "just" || C === "justLow" ? "just" : C === "thaiDist" ? "thaiDist" : C === "dist" ? "dist" : null, W = w || (c.endsWithBreak ?? !1), re = (ee && !j && !M ? Nn(c.segments, O - m, N, ee, W) : null) ?? c.segments, ie = j ? An(c.segments, A) : null, K = re.length;
		for (let t = 0; t < K; t++) {
			let n = ie ? ie.order[t] : t, c = re[n], d = ie ? ie.rtl[n] : !1;
			if (j && (e.direction = d ? "rtl" : "ltr"), c.isTab) {
				V += c.tabWidthPx ?? 0;
				continue;
			}
			let p = c.jext ?? 0, m = c.splitBefore, _ = c.perGap ?? 0, v = m && m.length > 0 ? m.length * _ : 0;
			if (c.math) {
				let t = Xn.get(c.math.nodes), n = c.math.width, r = c.math.ascent + c.math.descent;
				if (t && n > 0 && r > 0) {
					let i = F - c.math.ascent, a = Zn(t, c.color);
					e.drawImage(a, V, i, n, r);
				}
				V += n, V += p;
				continue;
			}
			e.font = c.font, e.fillStyle = c.color;
			let b = F + (c.baseline ? -(c.baseline / 1e5) * c.sizePx : 0), x = c.letterSpacingPx ?? 0;
			if (c.highlight && c.text) {
				let t = e.measureText(c.text).width + (x > 0 ? x * Q(c.text) : 0) + v + p;
				qn(e, V, b, t, c.sizePx, c.highlight, c.color);
			}
			let S = c.shadow;
			if (S) {
				let t = S.dir * Math.PI / 180, n = Y(S.dist, s);
				e.save(), e.shadowColor = X(S.color, S.alpha), e.shadowBlur = Y(S.blur, s), e.shadowOffsetX = Math.cos(t) * n, e.shadowOffsetY = Math.sin(t) * n;
			}
			let C = (t, n, r) => {
				let i = r === "fill" ? e.fillText.bind(e) : e.strokeText.bind(e);
				if (x > 0 && t.length > 1) {
					let r = e, a = r.letterSpacing;
					try {
						r.letterSpacing = `${x}px`;
					} catch {}
					i(t, n, b);
					try {
						r.letterSpacing = a;
					} catch {}
				} else i(t, n, b);
			}, w = (t) => e.measureText(t).width, T = m && m.length > 0 ? _n([...c.text], m, _, w, x) : null, E = [...c.text], D = !!m && m.length === E.length - 1 && E.length > 1, O = (t) => {
				if (y) {
					let n = D ? x + _ : x;
					Kn(e, c.text, V, b, c.sizePx, n, t);
					return;
				}
				if (D) {
					let n = e, r = n.letterSpacing;
					try {
						n.letterSpacing = `${x + _}px`;
					} catch {}
					(t === "fill" ? e.fillText.bind(e) : e.strokeText.bind(e))(c.text, V, b);
					try {
						n.letterSpacing = r;
					} catch {}
				} else if (T) for (let { text: e, dx: n } of T) C(e, V + n, t);
				else C(c.text, V, t);
			};
			O("fill"), S && e.restore();
			let k = c.outline;
			k && k.width > 0 && (e.save(), e.lineWidth = Math.max(.5, Y(k.width, s)), e.strokeStyle = k.color ? `#${k.color}` : c.color, e.lineJoin = "round", O("stroke"), e.restore()), e.font = c.font;
			let A = e.measureText(c.text).width + (x > 0 ? x * Q(c.text) : 0) + v;
			if (g && c.text && g({
				text: c.text,
				inShapeX: V - r,
				inShapeY: B - i,
				w: A + p,
				h: f,
				fontSize: c.sizePx,
				font: c.font,
				shapeX: r,
				shapeY: i,
				shapeW: a,
				shapeH: o,
				rotation: l,
				hyperlink: c.hyperlink
			}), c.underline && hn(e, V, b, A + p, c.sizePx, c.underlineColor ?? c.color, c.underlineStyle, h.dpr), c.strikethrough) {
				let t = Math.max(1, c.sizePx * .05);
				e.strokeStyle = c.color, e.lineWidth = t, e.setLineDash([]);
				let n = b - c.sizePx * .32;
				if (c.strikeDouble) {
					let r = t * .9, i = n - r, a = n + r;
					e.beginPath(), e.moveTo(V, i + u(i, t, h.dpr)), e.lineTo(V + A + p, i + u(i, t, h.dpr)), e.moveTo(V, a + u(a, t, h.dpr)), e.lineTo(V + A + p, a + u(a, t, h.dpr)), e.stroke();
				} else {
					let r = n + u(n, t, h.dpr);
					e.beginPath(), e.moveTo(V, r), e.lineTo(V + A + p, r), e.stroke();
				}
			}
			V += A, V += p;
		}
		j && (e.direction = "ltr"), B += d;
	}
	e.restore();
}
function Wr(e, t, n, r, i) {
	if (!e) return [];
	let a = nn(t?.rig ?? "threePt", t?.dir ?? "t", t?.rot), o = ln(n), s = r * i, c = [];
	return e.bevelT && e.bevelT.w > 0 && e.bevelT.h > 0 && c.push({
		widthPx: e.bevelT.w * s,
		heightPx: e.bevelT.h * s,
		prst: e.bevelT.prst || "circle",
		material: o,
		light: a
	}), e.bevelB && e.bevelB.w > 0 && e.bevelB.h > 0 && c.push({
		widthPx: e.bevelB.w * s,
		heightPx: e.bevelB.h * s,
		prst: e.bevelB.prst || "circle",
		material: o,
		light: a,
		bottom: !0
	}), c;
}
function Gr(e, t, n, r, i, a) {
	if (!e || !e.extrusionH || e.extrusionH <= 0) return null;
	let o = e.extrusionH * i * a, s = Ot(t, n * a, r * a, o);
	if (Math.hypot(s.x, s.y) < .75) return null;
	let c = [
		64,
		64,
		64
	];
	if (e.extrusionClr) {
		let t = e.extrusionClr.replace("#", "");
		t.length >= 6 && (c = [
			parseInt(t.slice(0, 2), 16),
			parseInt(t.slice(2, 4), 16),
			parseInt(t.slice(4, 6), 16)
		]);
	}
	return {
		offsetX: s.x,
		offsetY: s.y,
		rgb: c
	};
}
function Kr(e, t, n, r, i, a, o, s = {}) {
	if (i <= 0 || a <= 0) return !1;
	let l = e.getTransform(), u = Math.abs(l.a * l.d - l.b * l.c), d = u > 0 ? Math.sqrt(u) : 1, f = Math.max(0, Math.ceil((s.edgePadCss ?? 0) * d)), p = Et(t, i, a), m = p.corners;
	if (f > 0) {
		let e = f / d, t = Lt(p.corners, e / i, e / a);
		t ? m = t : f = 0;
	}
	let h = f / d, g = Math.max(1, Math.ceil(i * d) + 2 * f), _ = Math.max(1, Math.ceil(a * d) + 2 * f), v = c(g, _);
	if (!v) return !1;
	let y = v.getContext("2d");
	if (!y) return !1;
	y.save(), y.scale(d, d), y.translate(h, h), o(y, 0, 0, i, a), y.restore();
	let b = Math.ceil(i * d), x = Math.ceil(a * d), S = (e) => ({
		x: f - e,
		y: f - e,
		w: b + 2 * e,
		h: x + 2 * e
	});
	if (s.extrusion) {
		let e = Math.ceil(Math.hypot(s.extrusion.offsetX, s.extrusion.offsetY)) + 2;
		mn(y, s.extrusion, S(e));
	}
	if (s.bevels && s.bevels.length > 0) for (let e of s.bevels) pn(y, e, S(Math.ceil(e.widthPx) + 2));
	return s.paintEdges && (y.save(), y.scale(d, d), y.translate(h, h), s.paintEdges(y, 0, 0, i, a), y.restore()), Ft(v, e, g, _, m.map((e) => ({
		x: n + e.x,
		y: r + e.y
	}))), !0;
}
function qr(e, t, n, r, i, a, o, s, l = 0) {
	if (r <= 0 || i <= 0 || a.length === 0) return !1;
	let u = e.getTransform(), d = Math.abs(u.a * u.d - u.b * u.c), f = d > 0 ? Math.sqrt(d) : 1, p = Math.max(0, Math.ceil(l * f)), m = p / f, h = Math.max(1, Math.ceil(r * f) + 2 * p), g = Math.max(1, Math.ceil(i * f) + 2 * p), _ = c(h, g);
	if (!_) return !1;
	let v = _.getContext("2d");
	if (!v) return !1;
	v.save(), v.scale(f, f), v.translate(m, m), o(v, 0, 0, r, i), v.restore();
	let y = Math.ceil(r * f), b = Math.ceil(i * f);
	for (let e of a) {
		let t = Math.ceil(e.widthPx) + 2;
		pn(v, e, {
			x: p - t,
			y: p - t,
			w: y + 2 * t,
			h: b + 2 * t
		});
	}
	return s && (v.save(), v.scale(f, f), v.translate(m, m), s(v, 0, 0, r, i), v.restore()), e.drawImage(_, t - m, n - m, h / f, g / f), !0;
}
var Jr = /* @__PURE__ */ new WeakMap();
function Yr(e, t) {
	let n = Jr.get(e);
	if (n) return n;
	let r = (async () => {
		let n = await t(e.posterPath), r = e.posterMimeType ? new Blob([n], { type: e.posterMimeType }) : n;
		if (H(new Uint8Array(await r.slice(0, 64 * 1024).arrayBuffer()))) throw Error("poster raster exceeds the pixel budget");
		return createImageBitmap(r);
	})();
	return Jr.set(e, r), r;
}
async function Xr(e, r, i, a) {
	if (a) try {
		let o = r.mimeType === "image/svg+xml", { widthPt: s, heightPt: c } = de(r.mimeType, r.srcRect, r.width / n, r.height / n), l;
		if (P(r)) try {
			l = await we(r.svgImagePath, a);
		} catch {
			l = o ? await we(r.imagePath, a) : await We(r.imagePath, r.mimeType, r.duotone, a, {
				widthPt: s,
				heightPt: c
			});
		}
		else l = o ? await we(r.imagePath, a) : await We(r.imagePath, r.mimeType, r.duotone, a, {
			widthPt: s,
			heightPt: c
		});
		if (!l) return;
		e.save(), r.alpha != null && (e.globalAlpha *= r.alpha);
		let u = Y(r.x, i), d = Y(r.y, i), f = Y(r.width, i), p = Y(r.height, i);
		(r.rotation !== 0 || r.flipH || r.flipV) && (e.translate(u + f / 2, d + p / 2), e.rotate(r.rotation * Math.PI / 180), r.flipH && e.scale(-1, 1), r.flipV && e.scale(1, -1), e.translate(-(u + f / 2), -(d + p / 2)));
		let m = t(l, r.srcRect), h = (e, t, n, i, a) => {
			r.custGeom && r.custGeom.length > 0 ? Rr(e, r.custGeom, t, n, i, a) : r.prstGeom && ee(e, r.prstGeom, t, n, i, a, r.prstAdjust ?? []) || e.rect(t, n, i, a);
		}, g = (e, t, n, r, i) => {
			e.beginPath(), h(e, t, n, r, i);
		}, _ = (e, t, n, i, a) => {
			(r.prstGeom || r.custGeom && r.custGeom.length > 0) && (g(e, t, n, i, a), e.clip());
		}, v = (e, t, n, a, o) => {
			r.stroke && (e.save(), $(e, r.stroke, i), g(e, t, n, a, o), e.stroke(), e.restore());
		}, y = (e, t, n, a, o) => {
			let s = r.sp3d;
			if (s && (s.contourW ?? 0) > 0 && s.contourClr) {
				let r = Math.max(.5, s.contourW * i);
				e.save(), e.beginPath();
				let c = r * 2 + Math.max(a, o);
				e.rect(t - c, n - c, a + 2 * c, o + 2 * c), h(e, t, n, a, o), e.clip("evenodd"), e.beginPath(), g(e, t, n, a, o), e.strokeStyle = X(s.contourClr), e.lineWidth = r * 2, e.setLineDash([]), e.stroke(), e.restore();
			}
		}, b = r.scene3d && Dt(r.scene3d.camera) ? r.scene3d : null, x = (e, t, n, r, i) => {
			e.save(), _(e, t, n, r, i), m ? e.drawImage(l, m.sx, m.sy, m.sw, m.sh, t, n, r, i) : e.drawImage(l, t, n, r, i), e.restore();
		}, S = (e, t, n, r, i) => {
			x(e, t, n, r, i), v(e, t, n, r, i), y(e, t, n, r, i);
		}, C = (e, t, n, r, i) => {
			x(e, t, n, r, i), v(e, t, n, r, i);
		}, w = e.getTransform(), T = Math.abs(w.a * w.d - w.b * w.c), E = T > 0 ? Math.sqrt(T) : 1, D = Wr(r.sp3d, r.scene3d?.lightRig, r.sp3d ? r.sp3d.prstMaterial : void 0, i, E), O = b ? Gr(r.sp3d, b.camera, f, p, i, E) : null, k = r.stroke ? r.stroke.width * i / 2 : 0, A = r.sp3d?.contourW ? r.sp3d.contourW * i : 0, j = O ? Math.hypot(O.offsetX, O.offsetY) / E : 0, M = k + A + j + 2, N = (e) => {
			if (b) {
				if (Kr(e, b.camera, u, d, f, p, C, {
					bevels: D,
					extrusion: O ?? void 0,
					paintEdges: y,
					edgePadCss: M
				})) return;
			} else if (D.length > 0 && qr(e, u, d, f, p, D, C, y, M)) return;
			S(e, u, d, f, p);
		}, F = (e, t, n, r, i, a) => {
			e.save(), _(e, n, r, i, a), e.fillStyle = t, e.fillRect(n, r, i, a), e.restore();
		}, I = (e, t) => {
			b && Kr(e, b.camera, u, d, f, p, (e, n, r, i, a) => F(e, t, n, r, i, a)) || F(e, t, u, d, f, p);
		}, L = e.canvas.width || 0, R = e.canvas.height || 0, z = e.getTransform(), B = Math.abs(z.a * z.d - z.b * z.c), V = B > 0 ? Math.sqrt(B) : 1, H = {
			x: u * V,
			y: d * V,
			w: f * V,
			h: p * V
		}, U = i * V, W = (e) => e.setTransform(z), G = L > 0 && R > 0;
		r.reflection && G && (e.save(), e.setTransform(new DOMMatrix()), gt(e, (e) => {
			W(e), N(e);
		}, H, r.reflection, U, L, R), e.restore()), r.shadow ? xr(e, r.shadow, i) : r.glow && Sr(e, r.glow, i), r.softEdge && G ? (e.save(), e.setTransform(new DOMMatrix()), ht(e, (e) => {
			W(e), N(e);
		}, H, r.softEdge, U, L, R, (e) => {
			W(e), I(e, "#000");
		}), e.restore()) : N(e), (r.shadow || r.glow) && Cr(e), r.innerShadow && G && (e.save(), e.setTransform(new DOMMatrix()), mt(e, (e) => {
			W(e), I(e, "#000");
		}, H, r.innerShadow, U, L, R), e.restore()), e.restore();
	} catch {}
}
async function Zr(e, t, n, r, i) {
	let a = Y(t.x, n), o = Y(t.y, n), s = Y(t.width, n), c = Y(t.height, n), l;
	if (t.posterPath && r) try {
		l = await Yr(t, r);
	} catch {}
	e.save(), $r(e, t, n), l ? e.drawImage(l, a, o, s, c) : (e.fillStyle = t.mediaKind === "video" ? "#111" : "#f0f0f0", e.fillRect(a, o, s, c)), i || En(e, a + s / 2, o + c / 2, s, c, "paused"), e.restore();
}
function Qr(e, t, n, r, i, a) {
	let o = Math.max(.5, Y(r.width, a)), s = n.x - t.x, c = n.y - t.y, l = Math.hypot(s, c);
	if (l === 0) return;
	let u = -c / l, d = s / l, f;
	switch (i) {
		case "dbl":
			f = [{
				offset: -1 / 3,
				widthFrac: 1 / 3
			}, {
				offset: 1 / 3,
				widthFrac: 1 / 3
			}];
			break;
		case "thinThick":
			f = [{
				offset: -3 / 8,
				widthFrac: 1 / 4
			}, {
				offset: 1 / 4,
				widthFrac: 1 / 2
			}];
			break;
		case "thickThin":
			f = [{
				offset: -1 / 4,
				widthFrac: 1 / 2
			}, {
				offset: 3 / 8,
				widthFrac: 1 / 4
			}];
			break;
		case "tri":
			f = [
				{
					offset: -2 / 5,
					widthFrac: 1 / 5
				},
				{
					offset: 0,
					widthFrac: 3 / 5
				},
				{
					offset: 2 / 5,
					widthFrac: 1 / 5
				}
			];
			break;
		default: return;
	}
	e.save(), e.globalCompositeOperation = "destination-out", e.strokeStyle = "#000", e.lineWidth = o + .5, e.setLineDash([]), e.beginPath(), e.moveTo(t.x, t.y), e.lineTo(n.x, n.y), e.stroke(), e.globalCompositeOperation = "source-over", e.strokeStyle = X(r.color);
	for (let r of f) {
		let i = u * (o * r.offset), a = d * (o * r.offset);
		e.lineWidth = Math.max(.5, o * r.widthFrac), e.beginPath(), e.moveTo(t.x + i, t.y + a), e.lineTo(n.x + i, n.y + a), e.stroke();
	}
	e.restore();
}
function $(e, t, n) {
	je(e, t, n);
}
function $r(e, t, n) {
	if (t.rotation === 0 && !t.flipH && !t.flipV) return;
	let r = Y(t.x, n), i = Y(t.y, n), a = Y(t.width, n), o = Y(t.height, n);
	e.translate(r + a / 2, i + o / 2), e.rotate(t.rotation * Math.PI / 180), t.flipH && e.scale(-1, 1), t.flipV && e.scale(1, -1), e.translate(-(r + a / 2), -(i + o / 2));
}
function ei(e, t, n, r, i = {
	themeMajorFont: null,
	themeMinorFont: null,
	dpr: 1
}) {
	e.save(), $r(e, t, n);
	let a = Y(t.x, n), o = Y(t.y, n), s = t.cols.map((e) => Y(e, n)), c = s.length, l = (e, t) => {
		let n = 0;
		for (let r = 0; r < t; r++) n += s[e + r] ?? 0;
		return n;
	}, d = t.rows.map((e) => Y(e.height, n));
	for (let a = 0; a < t.rows.length; a++) {
		let o = t.rows[a];
		for (let t = 0; t < o.cells.length; t++) {
			let s = o.cells[t];
			if (s.hMerge || s.vMerge || (s.rowSpan || 1) > 1 || !s.textBody) continue;
			let c = l(t, s.gridSpan || 1), u = Ur(e, s.textBody, 0, 0, c, 0, n, null, 0, !1, !1, "#000000", r, i, void 0, !0) || 0;
			u > d[a] && (d[a] = u);
		}
	}
	for (let a = 0; a < t.rows.length; a++) {
		let o = t.rows[a];
		for (let t = 0; t < o.cells.length; t++) {
			let s = o.cells[t];
			if (s.hMerge || s.vMerge) continue;
			let c = s.rowSpan || 1;
			if (c <= 1 || !s.textBody) continue;
			let u = l(t, s.gridSpan || 1), f = Ur(e, s.textBody, 0, 0, u, 0, n, null, 0, !1, !1, "#000000", r, i, void 0, !0) || 0, p = 0;
			for (let e = 0; e < c && a + e < d.length; e++) p += d[a + e];
			if (f > p) {
				let e = (f - p) / c;
				for (let t = 0; t < c && a + t < d.length; t++) d[a + t] += e;
			}
		}
	}
	let f = s.reduce((e, t) => e + t, 0), p = Array(c);
	if (t.rtl) {
		let e = a + f;
		for (let t = 0; t < c; t++) e -= s[t], p[t] = e;
	} else {
		let e = a;
		for (let t = 0; t < c; t++) p[t] = e, e += s[t];
	}
	let m = (e, n) => t.rtl ? p[e + n - 1] : p[e], h = Array(t.rows.length);
	{
		let e = o;
		for (let n = 0; n < t.rows.length; n++) h[n] = e, e += d[n];
	}
	let g = [], _ = t.rows.map(() => Array(c).fill(-1));
	for (let e = 0; e < t.rows.length; e++) {
		let n = t.rows[e], r = h[e];
		for (let i = 0; i < n.cells.length; i++) {
			let a = n.cells[i];
			if (a.hMerge || a.vMerge) continue;
			let o = a.gridSpan || 1, s = a.rowSpan || 1, u = l(i, o), f = 0;
			for (let t = 0; t < s; t++) f += d[e + t] ?? 0;
			let p = m(i, o), h = Math.min(e + s - 1, t.rows.length - 1), v = g.length;
			g.push({
				cell: a,
				colX: p,
				rowY: r,
				cellW: u,
				cellH: f,
				ci: i,
				ri: e,
				span: o,
				lastRi: h
			});
			for (let t = e; t <= h; t++) for (let e = i; e < i + o && e < c; e++) _[t][e] = v;
		}
	}
	for (let { cell: t, colX: a, rowY: o, cellW: s, cellH: c } of g) {
		let l = Jn(t.fill);
		if (l && (e.fillStyle = l, e.fillRect(a, o, s, c)), t.textBody) {
			let l = t.textColor ? X(t.textColor) : null;
			Ur(e, t.textBody, a, o, s, c, n, l, 0, !1, !1, "#000000", r, i);
		}
	}
	let v = i.dpr, y = (e, t) => {
		if (e < 0 || e >= _.length || t < 0 || t >= c) return null;
		let n = _[e][t];
		return n < 0 ? null : g[n];
	}, b = (t, r, i, a, o) => {
		$(e, t, n);
		let s = r === a ? u(r, e.lineWidth, v) : 0, c = i === o ? u(i, e.lineWidth, v) : 0;
		e.beginPath(), e.moveTo(r + s, i + c), e.lineTo(a + s, o + c), e.stroke();
	};
	for (let r of g) {
		let { cell: i, colX: a, rowY: o, cellW: s, cellH: u } = r;
		e.save();
		let f = t.rtl ? i.borderR : i.borderL, p = t.rtl ? i.borderL : i.borderR, g = t.rtl ? r.ci + r.span === c : r.ci === 0, v = t.rtl ? r.ci === 0 : r.ci + r.span === c, x = t.rtl ? r.ci - 1 : r.ci + r.span, S = (e) => t.rtl ? e.borderR : e.borderL;
		if (r.ri === 0 && i.borderT && b(i.borderT, a, o, a + s, o), g && f && b(f, a, o, a, o + u), r.lastRi === t.rows.length - 1) {
			let e = i.borderB;
			e && b(e, a, o + u, a + s, o + u);
		} else {
			let e = r.lastRi + 1, t = o + u, n = Math.min(r.ci + r.span, c), a = r.ci;
			for (; a < n;) {
				let r = _[e][a], o = a + 1;
				for (; o < n && _[e][o] === r;) o++;
				let s = y(e, a), c = In(i.borderB, s ? s.cell.borderT : null);
				if (c) {
					let e = m(a, o - a);
					b(c, e, t, e + l(a, o - a), t);
				}
				a = o;
			}
		}
		if (v) {
			let e = p;
			e && b(e, a + s, o, a + s, o + u);
		} else {
			let e = a + s, t = r.ri;
			for (; t <= r.lastRi;) {
				let n = _[t][x], i = t;
				for (; i + 1 <= r.lastRi && _[i + 1][x] === n;) i++;
				let a = y(t, x), o = In(p, a ? S(a.cell) : null);
				o && b(o, e, h[t], e, h[i] + d[i]), t = i + 1;
			}
		}
		i.diagonalTL && ($(e, i.diagonalTL, n), e.beginPath(), e.moveTo(a, o), e.lineTo(a + s, o + u), e.stroke()), i.diagonalTR && ($(e, i.diagonalTR, n), e.beginPath(), e.moveTo(a + s, o), e.lineTo(a, o + u), e.stroke()), e.restore();
	}
	e.restore();
}
function ti(e, t, n, r) {
	e.save(), e.globalAlpha = t.opacity, e.fillStyle = t.color, e.fillRect(0, 0, n, r), e.restore();
}
var ni = /* @__PURE__ */ new WeakMap();
function ri(e, t, n, r, i) {
	e.save(), e.fillStyle = "#f7f7f8", e.fillRect(0, 0, t, n);
	let a = Math.max(12, Math.min(t, n) * .04);
	e.strokeStyle = "#c8ccd2", e.lineWidth = Math.max(1, Math.min(t, n) * .004), e.setLineDash([e.lineWidth * 6, e.lineWidth * 5]), e.strokeRect(a, a, t - a * 2, n - a * 2), e.setLineDash([]);
	let o = t / 2, s = Math.max(18, Math.min(t, n) * .14);
	e.fillStyle = "#b23b3b", e.textAlign = "center", e.textBaseline = "middle", e.font = `${s}px sans-serif`, e.fillText("⚠", o, n * .34);
	let c = Math.max(11, Math.min(t, n) * .045);
	e.fillStyle = "#333333", e.font = `600 ${c}px sans-serif`, e.fillText(`Slide ${r} could not be displayed`, o, n * .52);
	let l = Math.max(9, Math.min(t, n) * .028);
	e.fillStyle = "#666666", e.font = `${l}px sans-serif`;
	let u = t - a * 4, d = i.split(/\s+/), f = [], p = "";
	for (let t of d) {
		let n = p ? `${p} ${t}` : t;
		if (e.measureText(n).width > u && p ? (f.push(p), p = t) : p = n, f.length >= 4) break;
	}
	p && f.length < 4 && f.push(p);
	let m = l * 1.35, h = n * .6 + m;
	for (let t of f.slice(0, 4)) e.fillText(t, o, h), h += m;
	e.restore();
}
async function ii(e, t, n, r, i = {}, a) {
	let o = i.fetchImage ? ye(i.fetchImage) : void 0;
	try {
		return await ai(e, t, n, r, i, a);
	} finally {
		o?.();
	}
}
async function ai(e, t, r, i, a = {}, o) {
	let s = (ni.get(e) ?? 0) + 1;
	ni.set(e, s);
	let c = () => ni.get(e) !== s, l = a.width ?? ((ge(e) ? e.offsetWidth : 0) || 960), u = l / r, d = Math.round(l), f = Math.round(i * u), p = a.dpr ?? g(), m = N(d * p, f * p), h = m.clamped ? p * m.scale : p;
	e.width = m.width, e.height = m.height, ge(e) && (e.style.width = `${d}px`, e.style.display || (e.style.display = "block"));
	let _ = e.getContext("2d");
	if (!_) throw Error("Could not get 2D context");
	if (_.scale(h, h), t.parseError) return ri(_, d, f, t.slideNumber, t.parseError), e;
	let v = a.defaultTextColor ? `#${a.defaultTextColor}` : "#000000", y = {
		themeMajorFont: a.majorFont ?? null,
		themeMinorFont: a.minorFont ?? null,
		themeHlinkColor: a.hlinkColor ?? null,
		dpr: h,
		smartArtFallbackTextColor: Bn(t.background, v)
	};
	if (await _r(_, t.background, d, f, u, a.fetchImage), c() || (a.math && await nr(t, a.math), c())) return e;
	let b = t.slideNumber;
	for (let e of t.elements) if (e.type === "picture" && a.fetchImage) {
		let t = e, r = t.mimeType === "image/svg+xml";
		if (P(t)) we(t.svgImagePath, a.fetchImage).catch(() => void 0);
		else if (r) we(t.imagePath, a.fetchImage).catch(() => void 0);
		else {
			let e = de(t.mimeType, t.srcRect, t.width / n, t.height / n);
			We(t.imagePath, t.mimeType, t.duotone, a.fetchImage, {
				widthPt: e.widthPt,
				heightPt: e.heightPt
			}).catch(() => void 0);
		}
	} else if (e.type === "media") {
		let t = e;
		t.posterPath && a.fetchMedia && Yr(t, a.fetchMedia).catch(() => void 0);
	}
	if (a.fetchImage) {
		let n = a.fetchImage, r = /* @__PURE__ */ new Set();
		for (let e of t.elements) if (!(e.type !== "shape" || !e.textBody)) for (let t of e.textBody.paragraphs) {
			let e = wn(t.bullet);
			e.type === "blip" && r.add(`${e.imagePath} ${e.mimeType}`);
		}
		if (r.size > 0 && (await Promise.all([...r].map((e) => {
			let [t, r] = e.split(" ");
			return pe(t, r, n).catch(() => void 0);
		})), c())) return e;
	}
	for (let r of t.elements) {
		if (c()) return e;
		if (r.type === "shape") Lr(_, r, u, v, b, y, o, a.fetchImage);
		else if (r.type === "picture") await Xr(_, r, u, a.fetchImage);
		else if (r.type === "table") ei(_, r, u, b, y);
		else if (r.type === "media") await Zr(_, r, u, a.fetchMedia, a.skipMediaControls);
		else if (r.type === "chart") {
			let e = n * u;
			_.save(), $r(_, r, u), Ee(_, r.chart, {
				x: Y(r.x, u),
				y: Y(r.y, u),
				w: Y(r.width, u),
				h: Y(r.height, u)
			}, e), _.restore();
		}
	}
	return c() || a.dim && ti(_, a.dim, d, f), e;
}
//#endregion
//#region packages/pptx/src/tabular-text.ts
var oi = (e) => e >= "0" && e <= "9";
function si(e) {
	let t = 0;
	for (let n = 0; n < 10; n++) t = Math.max(t, e.measureText(String(n)).width);
	return t;
}
function ci(e, t, n) {
	let r = 0;
	for (let i of t) r += oi(i) ? n : e.measureText(i).width;
	return r;
}
function li(e, t, n, r, i) {
	let a = e.textAlign;
	e.textAlign = "left";
	let o = n;
	for (let n of t) if (oi(n)) {
		let t = e.measureText(n).width;
		e.fillText(n, o + (i - t) / 2, r), o += i;
	} else e.fillText(n, o, r), o += e.measureText(n).width;
	e.textAlign = a;
}
//#endregion
//#region packages/pptx/src/presentation-handle.ts
var ui = (e, t) => e / K * t;
async function di(e, t, n) {
	let r = e.getContext("2d");
	if (!r) throw Error("2D context not available");
	let i = n.width / (n.slideWidthEmu / K);
	await n.drawBase();
	let a = document.createElement("canvas");
	a.width = e.width, a.height = e.height;
	let o = a.getContext("2d");
	if (!o) throw Error("base 2D context not available");
	o.drawImage(e, 0, 0);
	let s = [];
	for (let e of t) {
		let t;
		try {
			t = await n.fetchMedia(e.mediaPath);
		} catch {
			continue;
		}
		let r = e.mimeType || t.type, a = t.type === r ? t : new Blob([t], { type: r }), o = URL.createObjectURL(a), c = e.mediaKind === "video" ? document.createElement("video") : document.createElement("audio");
		c.src = o, c.preload = "metadata", e.mediaKind === "video" && (c.playsInline = !0);
		let l = {
			x: ui(e.x, i),
			y: ui(e.y, i),
			w: ui(e.width, i),
			h: ui(e.height, i)
		}, u = e.mediaKind === "audio" ? {
			x: l.x + l.w / 2 - Math.max(l.w, 260) / 2,
			y: l.y,
			w: Math.max(l.w, 260),
			h: l.h + 36
		} : l;
		s.push({
			el: e,
			rect: u,
			posterRect: l,
			media: c,
			objectUrl: o
		});
	}
	let c = null, l = !1, u = null, d = () => {
		r.setTransform(n.dpr, 0, 0, n.dpr, 0, 0);
		let t = e.width / n.dpr, i = e.height / n.dpr;
		r.drawImage(a, 0, 0, e.width, e.height, 0, 0, t, i);
		for (let e of s) {
			let t = e.media;
			if (e.el.mediaKind === "video" && t.readyState >= 2) {
				let { x: n, y: i, w: a, h: o } = e.posterRect;
				r.drawImage(t, n, i, a, o);
			}
			if (e === u || h?.state === e) _i(r, e, t);
			else if (t.paused) {
				let { x: t, y: n, w: i, h: a } = e.posterRect;
				En(r, t + i / 2, n + a / 2, i, a, "paused");
			}
		}
	}, f = () => {
		l || (d(), c = requestAnimationFrame(f));
	}, p = (t, r) => {
		let i = e.getBoundingClientRect(), a = e.width / n.dpr, o = e.height / n.dpr;
		return {
			x: (t - i.left) / i.width * a,
			y: (r - i.top) / i.height * o
		};
	}, m = (e, t) => {
		for (let n of s) {
			let { x: r, y: i, w: a, h: o } = n.rect;
			if (e < r || e > r + a || t < i || t > i + o) continue;
			let s = Ci(n), c = s.y - 12, l = s.y + s.h + 8;
			return (Number.isFinite(n.media.duration) ? n.media.duration : 0) > 0 && e >= s.x && e <= s.x + s.w && t >= c && t <= l ? {
				kind: "seek",
				state: n,
				fraction: Math.max(0, Math.min(1, (e - s.x) / s.w))
			} : {
				kind: "toggle",
				state: n
			};
		}
		return null;
	}, h = null, g = (e, t) => {
		let n = Number.isFinite(e.media.duration) ? e.media.duration : 0;
		n <= 0 || (e.media.currentTime = n * t);
	}, _ = (t) => {
		let { x: n, y: r } = p(t.clientX, t.clientY), i = m(n, r);
		i && (i.kind === "seek" ? (h = {
			state: i.state,
			wasPlaying: !i.state.media.paused
		}, i.state.media.pause(), g(i.state, i.fraction), e.setPointerCapture(t.pointerId), t.preventDefault()) : i.state.media.paused ? i.state.media.play().catch(() => void 0) : i.state.media.pause());
	}, v = (e) => {
		let { x: t, y: n } = p(e.clientX, e.clientY);
		u = null;
		for (let e of s) {
			let { x: r, y: i, w: a, h: o } = e.rect;
			if (t >= r && t <= r + a && n >= i && n <= i + o) {
				u = e;
				break;
			}
		}
		if (h) {
			let e = Ci(h.state), n = Math.max(0, Math.min(1, (t - e.x) / e.w));
			g(h.state, n);
		}
	}, y = () => {
		u = null;
	}, b = (t) => {
		if (!h) return;
		let { wasPlaying: n, state: r } = h;
		h = null, e.releasePointerCapture(t.pointerId), n && r.media.play().catch(() => void 0);
	};
	return s.length > 0 && (e.addEventListener("pointerdown", _), e.addEventListener("pointermove", v), e.addEventListener("pointerleave", y), e.addEventListener("pointerup", b), e.addEventListener("pointercancel", b), e.style.cursor = "pointer", f()), {
		play(e) {
			for (let t of s) (!e || t.el.mediaPath === e) && t.media.play().catch(() => void 0);
		},
		pause(e) {
			for (let t of s) (!e || t.el.mediaPath === e) && t.media.pause();
		},
		destroy() {
			if (!l) {
				l = !0, c !== null && cancelAnimationFrame(c), e.removeEventListener("pointerdown", _), e.removeEventListener("pointermove", v), e.removeEventListener("pointerleave", y), e.removeEventListener("pointerup", b), e.removeEventListener("pointercancel", b), e.style.cursor = "";
				for (let e of s) e.media.pause(), e.media.removeAttribute("src"), e.media.load(), URL.revokeObjectURL(e.objectUrl);
			}
		}
	};
}
var fi = 28, pi = 14, mi = 72, hi = 10, gi = 3;
function _i(e, t, n) {
	let r = Number.isFinite(n.duration) ? n.duration : 0, i = r > 0 ? Math.min(1, n.currentTime / r) : 0, a = t.posterRect;
	En(e, a.x + a.w / 2, a.y + a.h / 2, a.w, a.h, n.paused ? "paused" : "playing"), t.el.mediaKind === "audio" ? yi(e, t, n, r, i) : vi(e, t, n, r, i);
}
function vi(e, t, n, r, i) {
	let { x: a, y: o, w: s, h: c } = t.rect, l = Math.max(28, Math.min(56, c * .22)), u = o + c - l;
	e.save();
	let d = e.createLinearGradient(0, u, 0, o + c);
	d.addColorStop(0, "rgba(0, 0, 0, 0)"), d.addColorStop(1, "rgba(0, 0, 0, 0.55)"), e.fillStyle = d, e.fillRect(a, u, s, l), e.restore();
	let f = Ci(t);
	xi(e, f, i, r > 0), e.save(), e.font = "500 11px system-ui, -apple-system, sans-serif", e.textBaseline = "middle", e.shadowColor = "rgba(0, 0, 0, 0.75)", e.shadowBlur = 3, e.fillStyle = "rgba(255, 255, 255, 0.95)", bi(e, n.currentTime, r, f.x, f.y - 10, "bottom"), e.restore();
}
function yi(e, t, n, r, i) {
	let a = Si(t.rect);
	e.save(), wi(e, a.x, a.y, a.w, a.h, a.h / 2), e.fillStyle = "rgba(20, 20, 20, 0.72)", e.fill(), e.font = "500 11px system-ui, -apple-system, sans-serif", e.textBaseline = "middle", e.fillStyle = "rgba(255, 255, 255, 0.95)", bi(e, n.currentTime, r, a.x + pi, a.y + a.h / 2, "middle"), e.restore(), xi(e, Ci(t), i, r > 0);
}
function bi(e, t, n, r, i, a) {
	let o = Ti(t), s = Ti(n), c = si(e), l = ci(e, o, c), u = ci(e, s, c), d = e.measureText(" / ").width, f = Math.max(l, u);
	li(e, o, r + f - l, i, c);
	let p = e.textAlign;
	e.textAlign = "left", e.fillText(" / ", r + f, i), e.textAlign = p, li(e, s, r + f + d, i, c);
}
function xi(e, t, n, r) {
	let i = t.h / 2;
	if (e.save(), wi(e, t.x, t.y, t.w, t.h, i), e.fillStyle = "rgba(255, 255, 255, 0.35)", e.fill(), n > 0 && (wi(e, t.x, t.y, t.w * n, t.h, i), e.fillStyle = "#fff", e.fill()), r) {
		let r = Math.max(t.x + 5, Math.min(t.x + t.w - 5, t.x + t.w * n));
		e.shadowColor = "rgba(0, 0, 0, 0.3)", e.shadowBlur = 3, e.fillStyle = "#fff", e.beginPath(), e.arc(r, t.y + t.h / 2, 5, 0, Math.PI * 2), e.fill();
	}
	e.restore();
}
function Si(e) {
	let t = Math.max(220, e.w - 24);
	return {
		x: e.x + e.w / 2 - t / 2,
		y: e.y + e.h - fi - 4,
		w: t,
		h: fi
	};
}
function Ci(e) {
	if (e.el.mediaKind === "audio") {
		let t = Si(e.rect), n = t.x + pi + mi + hi, r = Math.max(40, t.x + t.w - pi - n);
		return {
			x: n,
			y: t.y + (t.h - gi) / 2,
			w: r,
			h: gi
		};
	}
	let t = e.rect, n = Math.max(12, t.w * .025), r = Math.max(12, Math.min(18, t.h * .05));
	return {
		x: t.x + n,
		y: t.y + t.h - gi - r,
		w: t.w - n * 2,
		h: gi
	};
}
function wi(e, t, n, r, i, a) {
	let o = Math.min(a, i / 2, r / 2);
	e.beginPath(), e.moveTo(t + o, n), e.lineTo(t + r - o, n), e.quadraticCurveTo(t + r, n, t + r, n + o), e.lineTo(t + r, n + i - o), e.quadraticCurveTo(t + r, n + i, t + r - o, n + i), e.lineTo(t + o, n + i), e.quadraticCurveTo(t, n + i, t, n + i - o), e.lineTo(t, n + o), e.quadraticCurveTo(t, n, t + o, n), e.closePath();
}
function Ti(e) {
	if (!Number.isFinite(e) || e < 0) return "0:00";
	let t = Math.floor(e);
	return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, "0")}`;
}
//#endregion
//#region packages/pptx/src/notes.ts
function Ei(e, t) {
	return !Number.isInteger(t) || t < 0 || t >= e.length ? null : e[t].notes ?? null;
}
//#endregion
//#region packages/pptx/src/hidden.ts
function Di(e, t) {
	return !Number.isInteger(t) || t < 0 || t >= e.length ? !1 : e[t].hidden ?? !1;
}
//#endregion
//#region packages/pptx/src/slide-nav.ts
function Oi(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		r !== void 0 && r !== "" && !t.has(r) && t.set(r, n);
	}
	return t;
}
function ki(e, t) {
	if (e === "") return;
	let n = vn("ppt/slides", e);
	return t.get(n);
}
function Ai(e, t, n) {
	let r = yn(e);
	return r === null ? ki(e, t) : bn(r, n, t.size);
}
//#endregion
//#region packages/pptx/src/google-fonts.ts
var ji = {
	...i,
	...l
};
function* Mi(e) {
	for (let t of e?.paragraphs ?? []) for (let e of t.runs) e.type === "text" && (yield e.text);
}
function* Ni(e) {
	for (let t of e.slides) for (let e of t.elements) if (e.type === "shape") yield* Mi(e.textBody);
	else if (e.type === "table") for (let t of e.rows) for (let e of t.cells) yield* Mi(e.textBody);
	else if (e.type === "chart") {
		e.chart.title && (yield e.chart.title);
		for (let t of e.chart.categories) yield t;
		for (let t of e.chart.series) t.name && (yield t.name);
	}
}
function Pi(e) {
	let t = v(e.majorFont) ?? v(e.minorFont) ?? null;
	return [
		e.majorFont,
		e.minorFont,
		...Me(Ni(e), t)
	];
}
//#endregion
//#region packages/pptx/src/media-mime.ts
function Fi(e, t) {
	for (let n of e.slides) for (let e of n.elements) {
		if (e.type !== "media") continue;
		let n = e;
		if (n.mediaPath === t) return n.mimeType;
		if (n.posterPath === t) return n.posterMimeType;
	}
	return "";
}
//#endregion
//#region packages/pptx/src/worker.ts?worker&inline
var Ii = "function e(e){if(!e.startsWith(`data:`))return null;let t=e.indexOf(`,`);if(t===-1)return null;let n=atob(e.slice(t+1)),r=new Uint8Array(n.length);for(let e=0;e<n.length;e++)r[e]=n.charCodeAt(e);return r.buffer}var t=class e extends Error{code=`parser-crashed`;constructor(t){super(t),this.name=`WasmTrapError`,Object.setPrototypeOf(this,e.prototype)}};function n(e){let t=globalThis.WebAssembly?.RuntimeError;if(t&&e instanceof t||e instanceof RangeError)return!0;if(e instanceof Error){let t=e.name;if(t===`RuntimeError`||t===`CompileError`||t===`LinkError`)return!0}return!1}var r=class{_init;_opts;_wasmInput=null;_initPromise=null;_poisoned=!1;_archive=null;constructor(e,t={}){this._init=e,this._opts=t}setWasmUrl(e){this._wasmInput=e,this._poisoned=!1,this._initPromise=this._init(e)}get archive(){return this._archive}setArchive(e){this._freeArchive(),this._archive=e}disposeArchive(){this._freeArchive()}_freeArchive(){this._archive!=null&&this._opts.freeArchive&&this._opts.freeArchive(this._archive),this._archive=null}get poisoned(){return this._poisoned}async ensureReady(){if(this._poisoned){if(this._wasmInput===null)throw Error(`WasmParserHost: setWasmUrl was never called`);let e=(this._opts.reinit??this._init)(this._wasmInput);this._initPromise=e,await e,this._poisoned=!1;return}if(this._initPromise===null)throw Error(`WasmParserHost: setWasmUrl was never called`);await this._initPromise}run(e){try{return e()}catch(e){throw n(e)?(this._poison(),new t(`WASM parser trapped and was recycled: ${e instanceof Error?e.message:String(e)}`)):e}}poison(){this._poison()}_poison(){if(this._poisoned=!0,this._initPromise=null,this._archive!=null&&this._opts.freeArchive)try{this._opts.freeArchive(this._archive)}catch{}this._archive=null}},i=class{__destroy_into_raw(){let e=this.__wbg_ptr;return this.__wbg_ptr=0,o.unregister(this),e}free(){let e=this.__destroy_into_raw();S.__wbg_pptxarchive_free(e,0)}extract_image(e){let t=h(e,S.__wbindgen_malloc,S.__wbindgen_realloc),n=x,r=S.pptxarchive_extract_image(this.__wbg_ptr,t,n);if(r[3])throw g(r[2]);var i=s(r[0],r[1]).slice();return S.__wbindgen_free(r[0],r[1]*1,1),i}extract_media(e){let t=h(e,S.__wbindgen_malloc,S.__wbindgen_realloc),n=x,r=S.pptxarchive_extract_media(this.__wbg_ptr,t,n);if(r[3])throw g(r[2]);var i=s(r[0],r[1]).slice();return S.__wbindgen_free(r[0],r[1]*1,1),i}constructor(e,t){let n=m(e,S.__wbindgen_malloc),r=x,i=S.pptxarchive_new(n,r,!p(t),p(t)?BigInt(0):t);if(i[2])throw g(i[1]);return this.__wbg_ptr=i[0]>>>0,o.register(this,this.__wbg_ptr,this),this}parse(){let e=S.pptxarchive_parse(this.__wbg_ptr);if(e[3])throw g(e[2]);var t=s(e[0],e[1]).slice();return S.__wbindgen_free(e[0],e[1]*1,1),t}to_markdown(){let e,t;try{let i=S.pptxarchive_to_markdown(this.__wbg_ptr);var n=i[0],r=i[1];if(i[3])throw n=0,r=0,g(i[2]);return e=n,t=r,u(n,r)}finally{S.__wbindgen_free(e,t,1)}}};Symbol.dispose&&(i.prototype[Symbol.dispose]=i.prototype.free);function a(){return{__proto__:null,\"./pptx_parser_bg.js\":{__proto__:null,__wbg___wbindgen_throw_6b64449b9b9ed33c:function(e,t){throw Error(u(e,t))},__wbg_error_a6fa202b58aa1cd3:function(e,t){let n,r;try{n=e,r=t,console.error(u(e,t))}finally{S.__wbindgen_free(n,r,1)}},__wbg_new_227d7c05414eb861:function(){return Error()},__wbg_stack_3b0d974bbf31e44f:function(e,t){let n=t.stack,r=h(n,S.__wbindgen_malloc,S.__wbindgen_realloc),i=x;l().setInt32(e+4,i,!0),l().setInt32(e+0,r,!0)},__wbindgen_cast_0000000000000001:function(e,t){return u(e,t)},__wbindgen_init_externref_table:function(){let e=S.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}const o=typeof FinalizationRegistry>`u`?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(e=>S.__wbg_pptxarchive_free(e>>>0,1));function s(e,t){return e>>>=0,f().subarray(e/1,e/1+t)}let c=null;function l(){return(c===null||c.buffer.detached===!0||c.buffer.detached===void 0&&c.buffer!==S.memory.buffer)&&(c=new DataView(S.memory.buffer)),c}function u(e,t){return e>>>=0,y(e,t)}let d=null;function f(){return(d===null||d.byteLength===0)&&(d=new Uint8Array(S.memory.buffer)),d}function p(e){return e==null}function m(e,t){let n=t(e.length*1,1)>>>0;return f().set(e,n/1),x=e.length,n}function h(e,t,n){if(n===void 0){let n=b.encode(e),r=t(n.length,1)>>>0;return f().subarray(r,r+n.length).set(n),x=n.length,r}let r=e.length,i=t(r,1)>>>0,a=f(),o=0;for(;o<r;o++){let t=e.charCodeAt(o);if(t>127)break;a[i+o]=t}if(o!==r){o!==0&&(e=e.slice(o)),i=n(i,r,r=o+e.length*3,1)>>>0;let t=f().subarray(i+o,i+r),a=b.encodeInto(e,t);o+=a.written,i=n(i,r,o,1)>>>0}return x=o,i}function g(e){let t=S.__wbindgen_externrefs.get(e);return S.__externref_table_dealloc(e),t}let _=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0});_.decode();let v=0;function y(e,t){return v+=t,v>=2146435072&&(_=new TextDecoder(`utf-8`,{ignoreBOM:!0,fatal:!0}),_.decode(),v=t),_.decode(f().subarray(e,e+t))}const b=new TextEncoder;`encodeInto`in b||(b.encodeInto=function(e,t){let n=b.encode(e);return t.set(n),{read:e.length,written:n.length}});let x=0,S;function C(e,t){return S=e.exports,c=null,d=null,S.__wbindgen_start(),S}async function w(e,t){if(typeof Response==`function`&&e instanceof Response){if(typeof WebAssembly.instantiateStreaming==`function`)try{return await WebAssembly.instantiateStreaming(e,t)}catch(t){if(e.ok&&n(e.type)&&e.headers.get(`Content-Type`)!==`application/wasm`)console.warn(\"`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\\n\",t);else throw t}let r=await e.arrayBuffer();return await WebAssembly.instantiate(r,t)}else{let n=await WebAssembly.instantiate(e,t);return n instanceof WebAssembly.Instance?{instance:n,module:e}:n}function n(e){switch(e){case`basic`:case`cors`:case`default`:return!0}return!1}}async function T(e){if(S!==void 0)return S;e!==void 0&&(Object.getPrototypeOf(e)===Object.prototype?{module_or_path:e}=e:console.warn(`using deprecated parameters for the initialization function; pass a single object instead`));let t=a();(typeof e==`string`||typeof Request==`function`&&e instanceof Request||typeof URL==`function`&&e instanceof URL)&&(e=fetch(e));let{instance:n,module:r}=await w(await e,t);return C(n,r)}async function E(e){return S=void 0,c=null,d=null,T(e)}const D=new r(T,{freeArchive:e=>e.free(),reinit:E});self.onmessage=async t=>{let n=t.data;if(n.kind===`init`){D.setWasmUrl(e(n.wasmUrl)??n.wasmUrl);return}let r=n.id;try{if(await D.ensureReady(),n.kind===`parse`){let e=typeof n.maxZipEntryBytes==`number`&&n.maxZipEntryBytes>0?BigInt(n.maxZipEntryBytes):void 0,t=new Uint8Array(n.buffer),a=D.run(()=>{let n=new i(t,e);return D.setArchive(n),n.parse()}).buffer,o={kind:`parsed`,id:r,presentationJson:a};self.postMessage(o,[a]);return}let e=D.archive;if(n.kind===`extractMedia`){if(!e)throw Error(`No pptx loaded`);let t=D.run(()=>e.extract_media(n.path).buffer),i={kind:`mediaExtracted`,id:r,bytes:t};self.postMessage(i,[t]);return}if(n.kind===`extractImage`){if(!e)throw Error(`No pptx loaded`);let t=D.run(()=>e.extract_image(n.path).buffer),i={kind:`imageExtracted`,id:r,bytes:t};self.postMessage(i,[t]);return}if(n.kind===`toMarkdown`){if(!e)throw Error(`No pptx loaded`);let t={kind:`markdownRendered`,id:r,markdown:D.run(()=>e.to_markdown())};self.postMessage(t);return}}catch(e){let t={kind:`error`,id:r,message:e instanceof Error?e.message:String(e)};self.postMessage(t)}};", Li = typeof self < "u" && self.Blob && new Blob(["URL.revokeObjectURL(import.meta.url);", Ii], { type: "text/javascript;charset=utf-8" });
function Ri(e) {
	let t;
	try {
		if (t = Li && (self.URL || self.webkitURL).createObjectURL(Li), !t) throw "";
		let n = new Worker(t, {
			type: "module",
			name: e?.name
		});
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(Ii), {
			type: "module",
			name: e?.name
		});
	}
}
//#endregion
//#region packages/pptx/src/wasm/pptx_parser_bg.wasm?url
var zi = new URL("pptx_parser_bg.wasm", import.meta.url).href, Bi = class e {
	_worker;
	_bridge;
	_mode = "main";
	_presentation = null;
	_meta = null;
	_slidePartIndex = null;
	_mediaCache = /* @__PURE__ */ new Map();
	_imageCache = /* @__PURE__ */ new Map();
	_googleFontFaces = [];
	_fetchImage = (e, t) => this.getImage(e, t);
	_math;
	constructor(e, t, n) {
		this._worker = e, this._mode = t, this._bridge = new A(this._worker, {
			correlate: (e) => e.id,
			toError: (e) => e.kind === "error" ? e.message : void 0
		});
		let r = new URL(n ?? zi, location.href).href;
		this._bridge.post({
			kind: "init",
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
		i = h(await _e(i, n.password));
		let a = new e(r === "worker" ? (await import("./render-worker-host-Bz0flu1p.js")).createRenderWorker() : new Ri(), r, n.wasmUrl);
		return n.math && r === "worker" && console.warn("[ooxml] the math engine is unavailable in mode: 'worker'; equations will be skipped. Use mode: 'main' for documents with equations."), a._math = r === "worker" ? void 0 : n.math, await a._parse(i, n.maxZipEntryBytes, r === "worker" ? !!n.useGoogleFonts : !1, n.workerTimeoutMs), r === "main" && n.useGoogleFonts && a._presentation && (a._googleFontFaces = await f(Pi(a._presentation), ji)), a;
	}
	async _parse(e, t, n = !1, r) {
		let i = await this._bridge.request((r) => this._mode === "worker" ? {
			kind: "parse",
			id: r,
			buffer: e,
			maxZipEntryBytes: t,
			useGoogleFonts: n
		} : {
			kind: "parse",
			id: r,
			buffer: e,
			maxZipEntryBytes: t
		}, [e], { timeoutMs: r });
		if (this._mode === "worker") this._meta = i.meta;
		else {
			let { presentationJson: e } = i;
			this._presentation = JSON.parse(new TextDecoder().decode(new Uint8Array(e)));
		}
	}
	get slideCount() {
		return this._presentation?.slides.length ?? this._meta?.slideCount ?? 0;
	}
	get slideWidth() {
		return this._presentation?.slideWidth ?? this._meta?.slideWidth ?? 0;
	}
	get slideHeight() {
		return this._presentation?.slideHeight ?? this._meta?.slideHeight ?? 0;
	}
	get mode() {
		return this._mode;
	}
	getNotes(e) {
		return this._meta ? Number.isInteger(e) ? this._meta.notes[e] ?? null : null : Ei(this._presentation?.slides ?? [], e);
	}
	isHidden(e) {
		return this._meta ? Number.isInteger(e) ? this._meta.hidden[e] ?? !1 : !1 : Di(this._presentation?.slides ?? [], e);
	}
	_partNames() {
		return this._meta ? this._meta.partNames : (this._presentation?.slides ?? []).map((e) => e.partName);
	}
	_partIndex() {
		return this._slidePartIndex ||= Oi(this._partNames()), this._slidePartIndex;
	}
	getSlideIndexByPartName(e) {
		return this._partIndex().get(e);
	}
	resolveInternalTarget(e, t = 0) {
		return Ai(e, this._partIndex(), t);
	}
	async renderSlide(e, t, n = {}) {
		if (this._mode === "worker") throw Error("renderSlide(canvas) is unavailable in mode: 'worker'; use renderSlideToBitmap() and paint it via an ImageBitmapRenderingContext");
		if (!this._presentation) throw Error("Presentation not loaded");
		let r = this._presentation.slides[t];
		if (!r) throw Error(`Slide index ${t} out of range (count: ${this.slideCount})`);
		let i = n.dpr ?? g(), a = n.width ?? ((ge(e) ? e.offsetWidth : 0) || 960);
		await ii(e, r, this._presentation.slideWidth, this._presentation.slideHeight, {
			width: a,
			dpr: i,
			defaultTextColor: this._presentation.defaultTextColor,
			majorFont: this._presentation.majorFont,
			minorFont: this._presentation.minorFont,
			hlinkColor: this._presentation.hlinkColor ?? null,
			fetchMedia: (e) => this.getMedia(e),
			fetchImage: this._fetchImage,
			skipMediaControls: n.skipMediaControls,
			dim: n.dim,
			math: this._math
		}, n.onTextRun);
	}
	async renderSlideToBitmap(e, t = {}) {
		let n = t.width ?? 960, r = t.dpr ?? g();
		if (this._mode === "worker") {
			if (!Number.isInteger(e) || e < 0 || e >= this.slideCount) throw Error(`Slide index ${e} out of range (count: ${this.slideCount})`);
			let i = await this._bridge.request((i) => ({
				kind: "renderSlide",
				id: i,
				slideIndex: e,
				width: n,
				dpr: r,
				skipMediaControls: t.skipMediaControls,
				dim: t.dim
			}));
			if (t.onTextRun) for (let e of i.runs) t.onTextRun(e);
			return i.bitmap;
		}
		let i = new OffscreenCanvas(1, 1);
		return await this.renderSlide(i, e, {
			width: n,
			dpr: r,
			skipMediaControls: t.skipMediaControls,
			dim: t.dim,
			onTextRun: t.onTextRun
		}), i.transferToImageBitmap();
	}
	async collectSlideRuns(e, t = 960) {
		if (this._mode === "worker") {
			if (!Number.isInteger(e) || e < 0 || e >= this.slideCount) throw Error(`Slide index ${e} out of range (count: ${this.slideCount})`);
			return (await this._bridge.request((n) => ({
				kind: "collectRuns",
				id: n,
				slideIndex: e,
				width: t
			}))).runs;
		}
		let n = [], r = new OffscreenCanvas(1, 1);
		return await this.renderSlide(r, e, {
			width: t,
			onTextRun: (e) => n.push(e)
		}), n;
	}
	async getMedia(e) {
		let t = this._mediaCache.get(e);
		if (t) return t;
		let n = this._findMimeTypeForPath(e), r = (async () => {
			let t = (await this._bridge.request((t) => ({
				kind: "extractMedia",
				id: t,
				path: e
			}))).bytes;
			return new Blob([t], { type: n });
		})();
		return this._mediaCache.set(e, r), r;
	}
	_findMimeTypeForPath(e) {
		return this._presentation ? Fi(this._presentation, e) : "";
	}
	async getImage(e, t) {
		let n = this._imageCache.get(e);
		if (n) return n;
		let r = (async () => {
			let n = (await this._bridge.request((t) => ({
				kind: "extractImage",
				id: t,
				path: e
			}))).bytes;
			return new Blob([n], { type: t });
		})();
		return this._imageCache.set(e, r), r;
	}
	async toMarkdown() {
		return (await this._bridge.request((e) => ({
			kind: "toMarkdown",
			id: e
		}))).markdown;
	}
	async presentSlide(e, t, n = {}) {
		if (this._mode === "main" && !this._presentation) throw Error("Presentation not loaded");
		if (!Number.isInteger(t) || t < 0 || t >= this.slideCount) throw Error(`Slide index ${t} out of range (count: ${this.slideCount})`);
		let r = n.dpr ?? g(), i = n.width ?? (e.offsetWidth || 960), a = this._mode === "worker" ? async () => {
			let a = await this.renderSlideToBitmap(t, {
				width: i,
				dpr: r,
				skipMediaControls: !0,
				dim: n.dim,
				onTextRun: n.onTextRun
			});
			e.width = a.width, e.height = a.height, e.style.width = `${Math.round(a.width / r)}px`, e.style.display || (e.style.display = "block");
			let o = e.getContext("2d");
			if (!o) throw Error("2D context not available");
			o.drawImage(a, 0, 0), a.close();
		} : () => this.renderSlide(e, t, {
			width: i,
			dpr: r,
			skipMediaControls: !0,
			dim: n.dim,
			onTextRun: n.onTextRun
		});
		return di(e, this._mode === "worker" ? this._meta?.mediaElements[t] ?? [] : this._presentation.slides[t].elements.filter((e) => e.type === "media"), {
			width: i,
			dpr: r,
			slideWidthEmu: this.slideWidth,
			fetchMedia: (e) => this.getMedia(e),
			fetchImage: this._fetchImage,
			drawBase: a
		});
	}
	destroy() {
		this._bridge.terminate(), this._presentation = null, this._meta = null, this._slidePartIndex = null, this._mediaCache.clear(), this._imageCache.clear(), this._googleFontFaces.length > 0 && (j(this._googleFontFaces), this._googleFontFaces = []), z(this._fetchImage), Ge(this._fetchImage), se(this._fetchImage);
	}
}, Vi = {
	color: "#ffffff",
	opacity: .6
}, Hi = class {
	canvas;
	wrapper;
	_scale = null;
	_originalParent;
	_originalNextSibling;
	_originalDisplay;
	textLayer = null;
	highlightLayer = null;
	_find;
	_measureCtx = null;
	engine = null;
	opts;
	currentSlide = 0;
	_hiddenMode;
	handle = null;
	_mode;
	_bitmapCtx = null;
	_destroyed = !1;
	_loadGen = 0;
	constructor(e, t = {}) {
		this.opts = t, this.canvas = e, this._mode = t.mode ?? "main", this._hiddenMode = t.hiddenSlideMode ?? "show";
		let n = e.parentElement;
		this._originalParent = n, this._originalNextSibling = e.nextSibling, this._originalDisplay = e.style.display, this.wrapper = document.createElement("div"), this.wrapper.style.cssText = "position:relative;display:inline-block;vertical-align:top;", e.style.display || (e.style.display = "block"), n && n.insertBefore(this.wrapper, e), this.wrapper.appendChild(e), this._mode === "worker" && !t.enableMediaPlayback && (this._bitmapCtx = e.getContext("bitmaprenderer")), t.enableTextSelection && (this.textLayer = document.createElement("div"), this.textLayer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;user-select:text;-webkit-user-select:text;", this.wrapper.appendChild(this.textLayer)), this.highlightLayer = document.createElement("div"), this.highlightLayer.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;", this.wrapper.appendChild(this.highlightLayer), this._find = new Cn(() => this.slideCount, (e) => this._collectSlideRuns(e));
	}
	async load(e) {
		let t = ++this._loadGen, n = this.engine;
		try {
			let r = await Bi.load(e, {
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
			this.handle?.destroy(), this.handle = null, this.engine = r, n?.destroy(), this.currentSlide = this._initialSlide(), this._find.invalidate(), await this.renderCurrentSlide();
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
	async goToSlide(e) {
		!this.engine || this.slideCount === 0 || (this.currentSlide = Math.max(0, Math.min(e, this.slideCount - 1)), await this.renderCurrentSlide());
	}
	async nextSlide() {
		await this.goToSlide(this._step(1));
	}
	async prevSlide() {
		await this.goToSlide(this._step(-1));
	}
	_step(e) {
		return this._hiddenMode === "skip" && this.engine ? Ke(this.currentSlide, e, (e) => this.engine.isHidden(e), this.slideCount) : this.currentSlide + e;
	}
	_initialSlide() {
		return this._hiddenMode === "skip" && this.engine ? qe(0, (e) => this.engine.isHidden(e), this.slideCount) : 0;
	}
	_dim() {
		return {
			color: this.opts.hiddenSlideDim?.color ?? Vi.color,
			opacity: this.opts.hiddenSlideDim?.opacity ?? Vi.opacity
		};
	}
	async setHiddenSlideMode(e) {
		this._hiddenMode = e, e === "skip" && this.engine && (this.currentSlide = qe(this.currentSlide, (e) => this.engine.isHidden(e), this.slideCount)), await this.renderCurrentSlide();
	}
	get hiddenSlideMode() {
		return this._hiddenMode;
	}
	get visibleSlideCount() {
		if (!this.engine) return 0;
		let e = this.engine;
		return Je((t) => e.isHidden(t), this.slideCount);
	}
	get slideIndex() {
		return this.currentSlide;
	}
	get slideCount() {
		return this.engine?.slideCount ?? 0;
	}
	getNotes(e) {
		return this.engine?.getNotes(e) ?? null;
	}
	get canvasElement() {
		return this.canvas;
	}
	_naturalWidthPx() {
		let e = this.engine?.slideWidth ?? 0;
		return e > 0 ? e / K : 0;
	}
	_targetWidth() {
		if (this._scale === null) return this.opts.width ?? (this.canvas.offsetWidth || 960);
		let e = this._naturalWidthPx();
		return e <= 0 ? this.opts.width ?? (this.canvas.offsetWidth || 960) : Math.round(e * this._scale);
	}
	getScale() {
		if (this._scale !== null) return this._scale;
		let e = this._naturalWidthPx();
		return e <= 0 ? 1 : this._targetWidth() / e;
	}
	_zoomMin() {
		return this.opts.zoomMin ?? .1;
	}
	_zoomMax() {
		return this.opts.zoomMax ?? 4;
	}
	async setScale(e) {
		let t = Ce(e, this._zoomMin(), this._zoomMax()), n = t !== this.getScale();
		this._scale = t, await this.renderCurrentSlide(), n && this.opts.onScaleChange?.(t);
	}
	async zoomIn() {
		await this.setScale(W(this.getScale()));
	}
	async zoomOut() {
		await this.setScale(me(this.getScale()));
	}
	async fitWidth() {
		await this._fit("width");
	}
	async fitPage() {
		await this._fit("page");
	}
	async _fit(e) {
		if (!this.engine) return;
		let t = this.wrapper.parentElement;
		if (!t) return;
		let n = U({
			contentWidth: this.engine.slideWidth / K,
			contentHeight: this.engine.slideHeight / K,
			containerWidth: t.clientWidth,
			containerHeight: t.clientHeight
		}, e);
		n <= 0 || await this.setScale(n);
	}
	async renderCurrentSlide() {
		if (!this.engine) return;
		let e = this._hiddenMode === "dim" && this.engine.isHidden(this.currentSlide) ? this._dim() : void 0, t = this._targetWidth(), n = this.opts.dpr ?? (window.devicePixelRatio || 1), r = t / this.engine.slideWidth, i = Math.round(this.engine.slideHeight * r);
		this.canvas.style.width = `${t}px`, this.canvas.style.height = `${i}px`, this.handle?.destroy(), this.handle = null;
		let a = this._mode === "worker", o = [], s = (e) => o.push(e);
		try {
			if (this.opts.enableMediaPlayback) this.handle = await this.engine.presentSlide(this.canvas, this.currentSlide, {
				width: t,
				dpr: n,
				dim: e,
				onTextRun: s
			});
			else if (a) {
				let r = await this.engine.renderSlideToBitmap(this.currentSlide, {
					width: t,
					dpr: n,
					dim: e,
					onTextRun: s
				});
				this.canvas.width = r.width, this.canvas.height = r.height, this._bitmapCtx?.transferFromImageBitmap(r);
			} else await this.engine.renderSlide(this.canvas, this.currentSlide, {
				width: t,
				dpr: n,
				onTextRun: s,
				dim: e
			});
			this.opts.onSlideChange?.(this.currentSlide, this.slideCount);
		} catch (e) {
			this._reportRenderError(e);
		}
		this.textLayer && this._buildTextLayer(this.textLayer, o, t, i), this._find.setSlideRuns(this.currentSlide, o), this._buildHighlightLayer(o, t, i);
	}
	_buildHighlightLayer(e, t, n) {
		let r = this.highlightLayer;
		r && Sn(r, e, this._find.slideHighlights(this.currentSlide), t, n, (e) => this._measureForFont(e));
	}
	_measureForFont(e) {
		this._measureCtx ||= document.createElement("canvas").getContext("2d");
		let t = this._measureCtx;
		return t ? (t.font = e, (e) => t.measureText(e).width) : (e) => e.length;
	}
	async _collectSlideRuns(e) {
		return this.engine ? this.engine.collectSlideRuns(e, this._targetWidth()) : [];
	}
	async findText(e, t = {}) {
		if (!this.engine) return [];
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
		return e ? (e.location.slide === this.currentSlide ? this._redrawHighlights() : await this.goToSlide(e.location.slide), e) : (this._redrawHighlights(), null);
	}
	_redrawHighlights() {
		let e = this._find.slideRuns(this.currentSlide) ?? [], t = this._targetWidth(), n = this.engine ? Math.round(this.engine.slideHeight * (t / this.engine.slideWidth)) : 0;
		this._buildHighlightLayer(e, t, n);
	}
	_buildTextLayer(e, t, n, r) {
		xn(e, t, n, r, this._hyperlinkHandler());
	}
	_hyperlinkHandler() {
		if (this.opts.enableHyperlinks !== !1) return (e) => this._onHyperlinkClick(e);
	}
	_onHyperlinkClick(e) {
		let t = this._resolveInternalSlideIndex(e);
		if (this.opts.onHyperlinkClick) {
			this.opts.onHyperlinkClick(t);
			return;
		}
		if (t.kind === "external") {
			oe(t.url);
			return;
		}
		t.slideIndex !== void 0 && this.goToSlide(t.slideIndex);
	}
	_resolveInternalSlideIndex(e) {
		if (e.kind !== "internal" || e.slideIndex !== void 0) return e;
		let t = this.engine?.resolveInternalTarget(e.ref, this.currentSlide);
		return t === void 0 ? e : {
			...e,
			slideIndex: t
		};
	}
	_reportRenderError(e) {
		if (this._destroyed) return;
		let t = e instanceof Error ? e : Error(String(e));
		this.opts.onError ? this.opts.onError(t) : console.error("[ooxml] PptxViewer render failed:", t);
	}
	destroy() {
		if (this._destroyed = !0, this._loadGen++, this.handle?.destroy(), this.handle = null, this.engine?.destroy(), this._find.invalidate(), this._originalParent) {
			let e = this._originalNextSibling && this._originalNextSibling.parentNode === this._originalParent ? this._originalNextSibling : null;
			this._originalParent.insertBefore(this.canvas, e);
		} else this.canvas.parentNode && this.canvas.parentNode.removeChild(this.canvas);
		this.canvas.style.display = this._originalDisplay, this.wrapper.remove();
	}
}, Ui = 150, Wi = "0 1px 3px rgba(0,0,0,0.2)", Gi = class {
	_pres = null;
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
	_loadGen = 0;
	_slideInFlight = /* @__PURE__ */ new Set();
	_renderEpoch = 0;
	_settleTimer = null;
	_wheelListener = null;
	_pendingZoomAnchor = null;
	_resizeObserver = null;
	_prevBase = 0;
	_lastFitWidth = 0;
	_pageShadow;
	constructor(e, t = {}) {
		if (e.tagName === "CANVAS") throw Error("PptxScrollViewer takes a container element (e.g. a <div>), not a <canvas> — the viewer creates and manages its own canvases. Pass a block container; for the single-slide canvas API use PptxViewer.");
		if (this._container = e, this._opts = t, this._pageShadow = t.pageShadow ?? Wi, this._injected = !!t.presentation, this._injected) {
			let e = t.presentation;
			if (t.mode !== void 0 && t.mode !== e.mode) throw Error(`PptxScrollViewer: opts.mode='${t.mode}' conflicts with the injected engine's mode='${e.mode}'. Omit opts.mode when injecting an engine — the engine owns its render mode.`);
			this._pres = e, this._mode = e.mode;
		} else this._mode = t.mode ?? "main";
		this._wrapper = document.createElement("div"), this._wrapper.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;", this._scrollHost = document.createElement("div"), this._scrollHost.style.cssText = "position:absolute;inset:0;overflow:auto;", t.background && (this._scrollHost.style.background = t.background), this._spacer = document.createElement("div"), this._spacer.style.cssText = "position:absolute;top:0;left:0;width:1px;height:0;pointer-events:none;", this._scrollHost.appendChild(this._spacer), this._wrapper.appendChild(this._scrollHost), this._container.appendChild(this._wrapper), this._scrollListener = () => this._onScroll(), this._scrollHost.addEventListener("scroll", this._scrollListener), this._opts.enableZoom !== !1 && (this._wheelListener = (e) => {
			if (!(e.ctrlKey || e.metaKey) || (e.preventDefault(), e.deltaY === 0)) return;
			let t = this._scrollHost.getBoundingClientRect(), n = e.clientX - t.left, r = e.clientY - t.top;
			this._pendingZoomAnchor = Number.isFinite(n) && Number.isFinite(r) ? {
				x: n,
				y: r
			} : null, this.setScale(ne(this._scale, e.deltaY));
		}, this._scrollHost.addEventListener("wheel", this._wheelListener, { passive: !1 })), typeof ResizeObserver < "u" && (this._resizeObserver = new ResizeObserver(() => this._onResize()), this._resizeObserver.observe(this._container)), this._injected && this.relayout();
	}
	async load(e) {
		if (this._injected) throw Error("PptxScrollViewer.load() is unsupported when an engine is injected via opts.presentation; the injected engine is already loaded.");
		let t = ++this._loadGen, n = this._pres;
		try {
			let r = await Bi.load(e, {
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
			if (this._pres = r, n?.destroy(), n) {
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
	get slideCount() {
		return this._pres?.slideCount ?? 0;
	}
	_slideWidthPx() {
		return this._pres.slideWidth / K * this._scale;
	}
	_slideHeightPx() {
		return this._pres.slideHeight / K * this._scale;
	}
	_fitWidthPx() {
		if (this._opts.width && this._opts.width > 0) return this._opts.width;
		let e = this._container.clientWidth || this._scrollHost.clientWidth;
		if (e <= 0) return 0;
		let { left: t, right: n } = this._padH(), r = e - t - n;
		return r > 0 ? r : 0;
	}
	_baseScale() {
		if (!this._pres || this._pres.slideCount === 0) return 0;
		let e = this._fitWidthPx(), t = this._pres.slideWidth / K;
		return e <= 0 || t <= 0 ? 0 : e / t;
	}
	relayout() {
		if (this._pres) {
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
		let e = this._pres.slideCount, t = this._slideHeightPx();
		this._heights = Array(e).fill(t);
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
	_slideIndexAtOffset(e, t) {
		let { offsets: n } = e, r = 0, i = n.length - 1, a = 0;
		for (; r <= i;) {
			let e = r + i >> 1;
			n[e] <= t ? (a = e, r = e + 1) : i = e - 1;
		}
		return a;
	}
	_range() {
		return Ve(this._heights, this._gap(), this._scrollHost.scrollTop, this._scrollHost.clientHeight, this._overscan(), this._pad());
	}
	_syncSpacer() {
		let e = this._range();
		this._lastRange = e, this._spacer.style.height = `${e.totalHeight}px`, this._syncSpacerWidth();
	}
	_syncSpacerWidth() {
		let { left: e, right: t } = this._padH();
		this._spacer.style.width = `${this._slideWidthPx() + e + t}px`;
	}
	_onScroll() {
		!this._pres || !this._scaleEstablished || this._mountVisible();
	}
	_mountVisible() {
		if (!this._pres || this._pres.slideCount === 0) return;
		let e = this._range();
		this._lastRange = e;
		for (let [t, n] of [...this._slots]) (t < e.start || t > e.end) && this._recycleSlot(t, n);
		for (let t = e.start; t <= e.end; t++) if (this._slots.has(t)) this._positionSlot(this._slots.get(t), t, e);
		else {
			let n = this._acquireSlot();
			this._positionSlot(n, t, e), this._slots.set(t, n), this._renderSlot(t, n);
		}
		e.topIndex !== this._lastTopIndex && (this._lastTopIndex = e.topIndex, this._opts.onVisibleSlideChange?.(e.topIndex, this._pres.slideCount));
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
			renderedSlide: -1,
			renderedScale: -1,
			bitmap: null,
			bitmapCtx: null
		};
	}
	_recycleSlot(e, t) {
		this._slots.delete(e), t.bitmap &&= (t.bitmap.close(), null), t.textLayer && (t.textLayer.innerHTML = "", t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = ""), t.renderedSlide = -1, t.renderedScale = -1, t.wrapper.remove(), this._free.push(t);
	}
	_positionSlot(e, t, n) {
		e.wrapper.style.top = `${n.offsets[t]}px`;
		let r = this._slideWidthPx();
		e.wrapper.style.width = `${r}px`, e.wrapper.style.height = `${this._slideHeightPx()}px`;
		let { left: i } = this._padH(), a = this._scrollHost.clientWidth;
		e.wrapper.style.left = `${Math.max(i, (a - r) / 2)}px`;
	}
	_dpr() {
		return this._opts.dpr ?? (typeof window < "u" && window.devicePixelRatio || 1);
	}
	_renderSlot(e, t) {
		if (!this._pres || t.renderedSlide === e) return;
		t.renderedSlide = e;
		let n = this._dpr(), r = this._slideWidthPx(), i = this._renderEpoch, a = this._scale;
		if (this._mode === "worker") {
			this._renderSlotBitmap(e, t, r, n, a);
			return;
		}
		let o = [], s = !!this._opts.enableTextSelection && !!t.textLayer, c = s ? (e) => o.push(e) : void 0;
		this._pres.renderSlide(t.canvas, e, {
			width: r,
			dpr: n,
			onTextRun: c
		}).then(() => {
			i !== this._renderEpoch || this._slots.get(e) !== t || t.renderedSlide !== e || (t.renderedScale = a, s && t.textLayer && xn(t.textLayer, o, Math.round(r), Math.round(this._slideHeightPx()), this._hyperlinkHandler()));
		}).catch((e) => {
			this._reportRenderError(e);
		});
	}
	_reportRenderError(e) {
		if (this._destroyed) return;
		let t = e instanceof Error ? e : Error(String(e));
		this._opts.onError ? this._opts.onError(t) : console.error("[ooxml] PptxScrollViewer render failed:", t);
	}
	async _renderSlotBitmap(e, t, n, r, i) {
		if (this._slideInFlight.has(e) || this._slots.get(e) !== t) return;
		let a = this._renderEpoch;
		this._slideInFlight.add(e);
		let o = !1;
		t.bitmapCtx ||= t.canvas.getContext("bitmaprenderer");
		let s = !!this._opts.enableTextSelection && !!t.textLayer, c = [];
		try {
			let l = await this._pres.renderSlideToBitmap(e, {
				width: n,
				dpr: r,
				onTextRun: s ? (e) => c.push(e) : void 0
			});
			if (a !== this._renderEpoch || this._slots.get(e) !== t || t.renderedSlide !== e) {
				l.close();
				return;
			}
			t.bitmap && t.bitmap.close(), t.bitmap = l, t.canvas.width = l.width, t.canvas.height = l.height, t.canvas.style.width = `${Math.round(l.width / r)}px`, t.canvas.style.height = `${Math.round(l.height / r)}px`, t.bitmapCtx?.transferFromImageBitmap(l), t.bitmap = null, t.renderedScale = i, t.textLayer && (t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = "", s && xn(t.textLayer, c, Math.round(n), Math.round(this._slideHeightPx()), this._hyperlinkHandler())), o = !0;
		} catch (e) {
			this._reportRenderError(e);
		} finally {
			this._slideInFlight.delete(e);
			let n = this._slots.get(e);
			!o && n && (n !== t || a !== this._renderEpoch) && !this._slideInFlight.has(e) && !this._destroyed && this._renderSlotBitmap(e, n, this._slideWidthPx(), this._dpr(), this._scale);
		}
	}
	setScale(e) {
		let t = this._opts.zoomMin ?? .1, n = this._opts.zoomMax ?? 4, r = Math.min(n, Math.max(t, e)), i = this._pendingZoomAnchor;
		if (this._pendingZoomAnchor = null, !this._pres || this._pres.slideCount === 0 || !this._scaleEstablished) {
			this._pendingScale = r;
			return;
		}
		if (r === this._scale) return;
		let a = this._scale, o = i ? i.y : 0, s = this._range(), c = this._scrollHost.scrollTop + o, l = this._slideIndexAtOffset(s, c), u = this._heights[l] || 0, d = u > 0 ? (c - s.offsets[l]) / u : 0;
		d = Math.min(1, Math.max(0, d));
		let f = this._padH().left, p = this._scrollHost.scrollLeft || 0;
		this._renderEpoch++, this._scale = r, this._recomputeHeights();
		let m = Ve(this._heights, this._gap(), 0, this._scrollHost.clientHeight, this._overscan(), this._pad());
		this._spacer.style.height = `${m.totalHeight}px`, this._syncSpacerWidth();
		let h = Math.max(0, m.totalHeight - this._scrollHost.clientHeight), g = (m.offsets[l] ?? 0) + d * (this._heights[l] || 0);
		if (this._scrollHost.scrollTop = Math.min(h, Math.max(0, g - o)), i) {
			let e = Math.max(0, (this._spacer.offsetWidth || 0) - this._scrollHost.clientWidth);
			this._scrollHost.scrollLeft = ce(p, i.x - f, a, r, { maxScroll: e });
		}
		this._previewVisible(), this._scheduleSettle(), this._opts.onScaleChange?.(r);
	}
	getScale() {
		return this._scaleEstablished ? this._scale : this._pendingScale ?? 1;
	}
	zoomIn() {
		this.setScale(W(this.getScale()));
	}
	zoomOut() {
		this.setScale(me(this.getScale()));
	}
	fitWidth() {
		this._fit("width");
	}
	fitPage() {
		this._fit("page");
	}
	_fit(e) {
		if (!this._pres || this._pres.slideCount === 0) return;
		let t = U({
			contentWidth: this._pres.slideWidth / K,
			contentHeight: this._pres.slideHeight / K,
			containerWidth: this._fitWidthPx(),
			containerHeight: this._scrollHost.clientHeight
		}, e);
		t <= 0 || this.setScale(t);
	}
	_previewVisible() {
		if (!this._pres || this._pres.slideCount === 0) return;
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
		e.topIndex !== this._lastTopIndex && (this._lastTopIndex = e.topIndex, this._opts.onVisibleSlideChange?.(e.topIndex, this._pres.slideCount));
	}
	_previewSlot(e, t, n) {
		if (this._positionSlot(e, t, n), e.canvas.style.width = `${this._slideWidthPx()}px`, e.canvas.style.height = `${this._slideHeightPx()}px`, e.textLayer && e.renderedScale > 0) {
			let t = this._scale / e.renderedScale;
			e.textLayer.style.transformOrigin = "0 0", e.textLayer.style.transform = `scale(${t})`;
		}
	}
	_scheduleSettle() {
		this._settleTimer !== null && clearTimeout(this._settleTimer), this._settleTimer = setTimeout(() => {
			this._settleTimer = null, this._settleRender();
		}, Ui);
	}
	_settleRender() {
		if (!(this._destroyed || !this._pres || this._pres.slideCount === 0)) for (let [e, t] of [...this._slots]) t.renderedScale !== this._scale && this._settleSlot(e, t);
	}
	_settleSlot(e, t) {
		if (!this._pres) return;
		let n = this._dpr(), r = this._slideWidthPx(), i = this._scale, a = this._renderEpoch;
		if (this._mode === "worker") {
			this._renderSlotBitmap(e, t, r, n, i);
			return;
		}
		let o = document.createElement("canvas");
		o.style.cssText = "display:block;background:#fff;", this._applyPageShadow(o);
		let s = [], c = !!this._opts.enableTextSelection && !!t.textLayer, l = c ? (e) => s.push(e) : void 0;
		this._pres.renderSlide(o, e, {
			width: r,
			dpr: n,
			onTextRun: l
		}).then(() => {
			if (a !== this._renderEpoch || this._slots.get(e) !== t || t.renderedSlide !== e) return;
			let n = t.canvas;
			t.wrapper.insertBefore(o, n), n.remove(), t.canvas = o, t.bitmapCtx = null, t.renderedScale = i, t.textLayer && (t.textLayer.style.transform = "", t.textLayer.style.transformOrigin = "", c && xn(t.textLayer, s, Math.round(r), Math.round(this._slideHeightPx()), this._hyperlinkHandler()));
		}).catch((e) => {
			this._reportRenderError(e);
		});
	}
	scrollToSlide(e, t) {
		if (!this._pres || this._pres.slideCount === 0 || !this._scaleEstablished) return;
		let n = Math.max(0, Math.min(e, this._pres.slideCount - 1)), r = Ve(this._heights, this._gap(), 0, this._scrollHost.clientHeight, this._overscan(), this._pad()), i = r.offsets[n] ?? 0, a = Math.max(0, r.totalHeight - this._scrollHost.clientHeight), o = Math.min(a, Math.max(0, i)), s = this._scrollHost;
		typeof s.scrollTo == "function" ? s.scrollTo({
			top: o,
			behavior: t?.behavior ?? "auto"
		}) : this._scrollHost.scrollTop = o, this._mountVisible();
	}
	_hyperlinkHandler() {
		if (this._opts.enableHyperlinks !== !1) return (e) => this._onHyperlinkClick(e);
	}
	_onHyperlinkClick(e) {
		let t = this._resolveInternalSlideIndex(e);
		if (this._opts.onHyperlinkClick) {
			this._opts.onHyperlinkClick(t);
			return;
		}
		if (t.kind === "external") {
			oe(t.url);
			return;
		}
		t.slideIndex !== void 0 && this.scrollToSlide(t.slideIndex);
	}
	_resolveInternalSlideIndex(e) {
		if (e.kind !== "internal" || e.slideIndex !== void 0) return e;
		let t = this._pres?.resolveInternalTarget(e.ref, this._range().topIndex);
		return t === void 0 ? e : {
			...e,
			slideIndex: t
		};
	}
	_onResize() {
		if (!this._pres || this._pres.slideCount === 0) return;
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
	get topVisibleSlide() {
		return this._lastRange?.topIndex ?? 0;
	}
	mountedSlideIndicesForTest() {
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
		let t = this._range(), n = this._scrollHost.scrollTop + e, r = this._slideIndexAtOffset(t, n), i = this._heights[r] || 0;
		return {
			slide: r,
			frac: i > 0 ? Math.min(1, Math.max(0, (n - t.offsets[r]) / i)) : 0
		};
	}
	viewportYOfForTest(e, t) {
		return (this._range().offsets[e] ?? 0) + t * (this._heights[e] || 0) - this._scrollHost.scrollTop;
	}
	destroy() {
		this._destroyed = !0, this._loadGen++, this._scrollListener &&= (this._scrollHost.removeEventListener("scroll", this._scrollListener), null), this._wheelListener &&= (this._scrollHost.removeEventListener("wheel", this._wheelListener), null), this._resizeObserver?.disconnect(), this._resizeObserver = null, this._settleTimer !== null && (clearTimeout(this._settleTimer), this._settleTimer = null);
		for (let [e, t] of [...this._slots]) this._recycleSlot(e, t);
		this._free.length = 0, this._injected || this._pres?.destroy(), this._pres = null, this._wrapper.remove();
	}
}, Ki = /* @__PURE__ */ e({
	OoxmlError: () => F,
	PptxPresentation: () => Bi,
	PptxScrollViewer: () => Gi,
	PptxViewer: () => Hi,
	autoResize: () => R,
	buildPptxHighlightLayer: () => Sn,
	buildPptxTextLayer: () => xn,
	openExternalHyperlink: () => oe,
	renderSlide: () => ii
});
//#endregion
export { ii as a, Bi as i, Gi as n, Sn as o, Hi as r, xn as s, Ki as t };
