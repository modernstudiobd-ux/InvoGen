// screens/templates.js — built in stage 4. Until then this shows a short notice so
// navigation can be reviewed end to end.

import { placeholder } from "./placeholder.js";

export function mount(root, params) { return placeholder(root, "nav.templates", 4, params); }
export function unmount() {}
