/**
 * Every key this app writes in the browser's own storage. Nothing else is
 * stored anywhere: there are no cookies and no server-side records.
 */

/** localStorage: "light" or "dark", when the visitor chose a theme. */
export const THEME_STORAGE_KEY = "unikit:theme";
/** localStorage: the settings from the Settings page, as JSON. */
export const PREFERENCES_STORAGE_KEY = "unikit:preferences";
/** Class on <html> that turns animations off. */
export const REDUCE_MOTION_CLASS = "uk-reduce-motion";
