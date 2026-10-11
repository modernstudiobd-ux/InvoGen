// screens/guide.js — built in stage 6. Until then this shows a short notice so
// navigation can be reviewed end to end.

import { placeholder } from "./placeholder.js";

export function mount(root, params) { return placeholder(root, "guide.title", 6, params); }
export function unmount() {}
