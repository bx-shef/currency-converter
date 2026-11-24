/**
 * The theme-init inline script (FOUC guard): applies the stored/OS colour theme before first paint, because
 * b24ui colorMode (vueuse) sets the class only on the client. Defaults to `auto` (OS) when nothing is stored;
 * anything non-"light" is treated as dark. One source for app.vue (renders it) and the server CSP allow-list
 * (server/lib/security.ts — only this exact text is allowed for the `theme-init` script).
 */

/** b24ui colorMode persists the choice under this @vueuse/core key (keep in sync with `colorModeStorageKey`). */
export const COLOR_MODE_STORAGE_KEY = 'vueuse-color-scheme'

export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("${COLOR_MODE_STORAGE_KEY}")||"auto";if(s==="auto"){s=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var d=s!=="light";var c=document.documentElement.classList;c.toggle("dark",d);c.toggle("light",!d);}catch(e){}})();`
