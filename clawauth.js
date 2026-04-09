(function () {
    // Only run on deployed OpenClaw containers (*.oc.clawmode.ai)
    if (!window.location.hostname.endsWith('.oc.clawmode.ai')) return;

    var p = new URLSearchParams(window.location.search);
    var t = p.get("token");
    var s = localStorage.getItem("claw_token");

    // Use token from URL if present, otherwise fall back to stored token
    var token = t || s;

    if (token) {
        // Save/refresh token for our auth check
        localStorage.setItem("claw_token", token);

        // Write token into OpenClaw Control UI settings so it auto-connects
        var settingsKey = "openclaw.control.settings.v1";
        var settings = {};
        try { settings = JSON.parse(localStorage.getItem(settingsKey)) || {}; } catch (e) { }
        settings.token = token;
        localStorage.setItem(settingsKey, JSON.stringify(settings));

        // Notify OpenClaw Control UI that settings changed (triggers auto-connect)
        window.dispatchEvent(new StorageEvent("storage", {
            key: settingsKey,
            newValue: JSON.stringify(settings)
        }));
    } else {
        // No token anywhere — redirect to gateway for auth
        var d = window.location.hostname.split(".")[0];
        window.location.href = "https://clawmode.ai/gateway?subdomain=" + d;
    }
})();
