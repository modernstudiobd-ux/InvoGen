// screens/editor.js — built in stage 2. Until then this shows a short notice so
// navigation can be reviewed end to end.

import { placeholder } from "./placeholder.js";

export function mount(root, params) { return placeholder(root, "editor.title", 2, params); }
export function unmount() {}
