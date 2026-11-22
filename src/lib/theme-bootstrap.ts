/** Default to the brand's dark palette, honouring existing explicit choices. */
export const THEME_STORAGE_KEY = "unikit-theme";
export const themeBootstrapScript = `(function(){var d=document.documentElement;try{var s=localStorage.getItem('unikit-theme')||localStorage.getItem('ow-theme')||'dark';d.dataset.theme=s==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s==='light'?'light':'dark';}catch{d.dataset.theme='dark';}})();`;
