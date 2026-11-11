/* site-esri-config.js - the website's own Esri key (hardpangolf.com only).
   Manny, Nov 11 2026: a SEPARATE key for the website, referrer-locked to hardpangolf.com
   (checked: the Esri basemap styles service refuses it with no referrer or from another site).
   It is not the app's key (that one stays in gps-config.js, HardPan GPS only).
   This is the ONLY file in the repo that holds this key (web_e_features_test.js checks that).
   Used by site-features.js for the homepage "Try the GPS" box: Esri World Imagery tiles,
   credited "Powered by Esri" on the box. */
window.HP_SITE_ESRI = {
    key: 'AAPTa7qWdL4L0H5qqJlWk5BgIgA..NmIjKRTCuqYevfeaQhn5l2_7bd_YZK6ZEIVytlDjvKp3slJzDMKJGFPiusxDGk9R56miJmMi8FdJOraTw9JN-gqeQFS5kGqvlPfPH0PqaIS6H2PiWk1b3qANBYnJZf2WR4rDIx4SgScAoXTXtqFof9i6ctHfXwIgiel3gEKPTyjSIl4zh_j8DZIcVqPh9BVe9IXJ5Eoolb5mE6z9YRd25ggRxZxLQlkkyk1twluz_kE7n8T16RgjkFCxHK0.AT1_lJHcxG1R',
    tiles: 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token={key}'
};
