// Opened inside LINE's in-app browser? Re-open in the phone's default browser
// (LINE supports ?openExternalBrowser=1), where camera, mic and downloads work properly.
(function () {
  if (!/\bLine\//i.test(navigator.userAgent)) return;
  var u = new URL(location.href);
  if (u.searchParams.has('openExternalBrowser')) return;
  u.searchParams.set('openExternalBrowser', '1');
  location.replace(u.toString());
})();
