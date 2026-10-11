// screens/clients.js — built in stage 3. Until then this shows a short notice so
// navigation can be reviewed end to end.

import { placeholder } from "./placeholder.js";

export function mount(root, params) { return placeholder(root, "nav.clients", 3, params); }
export function unmount() {}
