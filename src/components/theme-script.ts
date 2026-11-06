/** Runs before the page paints (inline in <head>), so a dark page never flashes white. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
