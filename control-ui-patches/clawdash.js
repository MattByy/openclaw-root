(function(){
  // Derive dashboard URL from current hostname:
  //   swello-bene-nq5.oc.clawmode.ai -> swello-bene-nq5-dash.oc.clawmode.ai
  var host = location.hostname.replace(/^([^.]+)\.oc\./, '$1-dash.oc.');
  if (host === location.hostname) return; // pattern mismatch, bail
  var tok = "";
  try { var s = JSON.parse(localStorage.getItem("openclaw.control.settings.v1")||"{}"); tok = s.token || ""; } catch(e) {}
  if (!tok) { try { tok = sessionStorage.getItem("claw_token") || ""; } catch(e) {} }
  var url = location.protocol + "//" + host + "/hub/" + (tok ? ("?token=" + encodeURIComponent(tok)) : "");
  var btn = document.createElement('a');
  btn.href = url;
  btn.target = '_blank';
  btn.rel = 'noopener';
  btn.textContent = '◉ DASHBOARD';
  btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;padding:10px 18px;background:#0a0b10;color:#00f5a0;border:1px solid #00f5a0;border-radius:6px;font-family:monospace;font-size:12px;font-weight:600;letter-spacing:1px;text-decoration:none;box-shadow:0 0 20px rgba(0,245,160,0.3),inset 0 0 10px rgba(0,245,160,0.1);cursor:pointer;transition:all 0.2s';
  btn.onmouseenter = function(){ this.style.background='#00f5a0'; this.style.color='#0a0b10'; this.style.boxShadow='0 0 30px rgba(0,245,160,0.6)'; };
  btn.onmouseleave = function(){ this.style.background='#0a0b10'; this.style.color='#00f5a0'; this.style.boxShadow='0 0 20px rgba(0,245,160,0.3),inset 0 0 10px rgba(0,245,160,0.1)'; };
  function mount(){ if (document.body) document.body.appendChild(btn); else setTimeout(mount, 100); }
  mount();
})();
