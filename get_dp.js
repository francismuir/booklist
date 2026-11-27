/**
 * Amazon DP / ASIN Copy Bookmarklet
 *
 * SAFARI BOOKMARK URL (copy this single line into your Safari bookmark Address):
 * javascript:(function()%7Bfunction%20fromUrl(u)%7Bvar%20m%3DString(u%7C%7C'').match(%2F%5C%2F(%3F%3Adp%7Cgp%5C%2Fproduct%7Cgp%5C%2Faw%5C%2Fd%7Cgp%5C%2Foffer-listing%7Cexec%5C%2Fobidos%5C%2FASIN)%5C%2F(%5BA-Z0-9%5D%7B10%7D)%2Fi)%3Breturn%20m%3Fm%5B1%5D.toUpperCase()%3Anull%3B%7Dfunction%20valid(v)%7Bvar%20s%3DString(v%7C%7C'').trim().toUpperCase()%3Breturn%20%2F%5E%5BA-Z0-9%5D%7B10%7D%24%2F.test(s)%3Fs%3Anull%3B%7Dfunction%20findAsin()%7Bvar%20inp%3Ddocument.querySelector('input%23ASIN%2Cinput%5Bname%3D%22ASIN%22%5D%2Cinput%5Bname%3D%22ASIN.0%22%5D')%3Bvar%20a%3Dvalid(inp%26%26inp.value)%3Bif(a)return%20a%3Ba%3DfromUrl(location.href)%3Bif(a)return%20a%3Bvar%20can%3Ddocument.querySelector('link%5Brel%3D%22canonical%22%5D')%3Ba%3DfromUrl(can%26%26can.href)%3Bif(a)return%20a%3Bvar%20els%3Ddocument.querySelectorAll('%23dp-container%5Bdata-asin%5D%2C%23cerberus-data-metrics%5Bdata-asin%5D%2C%5Bdata-asin%5D')%3Bfor(var%20i%3D0%3Bi%3Cels.length%3Bi%2B%2B)%7Ba%3Dvalid(els%5Bi%5D.getAttribute('data-asin'))%3Bif(a)return%20a%3B%7Dreturn%20null%3B%7Dfunction%20toast(msg%2Cok)%7Bvar%20d%3Ddocument.createElement('div')%3Bd.textContent%3Dmsg%3Bd.style.cssText%3D'position%3Afixed%3Btop%3A16px%3Bright%3A16px%3Bz-index%3A2147483647%3Bpadding%3A10px%2014px%3Bborder-radius%3A8px%3Bfont%3A600%2014px%2F1.3%20-apple-system%2Csans-serif%3Bcolor%3A%23fff%3Bbox-shadow%3A0%204px%2014px%20rgba(0%2C0%2C0%2C.3)%3Bbackground%3A'%2B(ok%3F'%231f6f43'%3A'%23a42828')%3Bdocument.body.appendChild(d)%3BsetTimeout(function()%7Bd.remove()%3B%7D%2C2200)%3B%7Dfunction%20legacyCopy(txt)%7Bvar%20t%3Ddocument.createElement('textarea')%3Bt.value%3Dtxt%3Bt.setAttribute('readonly'%2C'')%3Bt.style.cssText%3D'position%3Afixed%3Btop%3A-9999px%3Bleft%3A-9999px'%3Bdocument.body.appendChild(t)%3Bt.select()%3Bt.setSelectionRange(0%2Ctxt.length)%3Bvar%20ok%3Dfalse%3Btry%7Bok%3Ddocument.execCommand('copy')%3B%7Dcatch(e)%7B%7Dt.remove()%3Breturn%20ok%3B%7Dvar%20asin%3DfindAsin()%3Bif(!asin)%7Btoast('No%20Amazon%20DP%2FASIN%20found%20on%20this%20page.'%2Cfalse)%3Breturn%3B%7Dif(navigator.clipboard%26%26navigator.clipboard.writeText)%7Bnavigator.clipboard.writeText(asin).then(function()%7Btoast('Copied%20ASIN%3A%20'%2Basin%2Ctrue)%3B%7D%2Cfunction()%7Bif(legacyCopy(asin))toast('Copied%20ASIN%3A%20'%2Basin%2Ctrue)%3Belse%20window.prompt('Copy%20ASIN%3A'%2Casin)%3B%7D)%3B%7Delse%20if(legacyCopy(asin))%7Btoast('Copied%20ASIN%3A%20'%2Basin%2Ctrue)%3B%7Delse%7Bwindow.prompt('Copy%20ASIN%3A'%2Casin)%3B%7D%7D)()%3B
 */

// ============================================================================
// READABLE, COMMENTED JAVASCRIPT VERSION
// ============================================================================

(function () {
  // Helper: extract a 10-character Amazon DP/ASIN from common Amazon URL paths
  // (/dp/, /gp/product/, /gp/aw/d/, /gp/offer-listing/, or /exec/obidos/ASIN/).
  function fromUrl(url) {
    var m = String(url || '').match(
      /\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/i
    );
    return m ? m[1].toUpperCase() : null;
  }

  // Helper: validate that a value is strictly a 10-character alphanumeric ASIN.
  function validAsin(val) {
    var s = String(val || '').trim().toUpperCase();
    return /^[A-Z0-9]{10}$/.test(s) ? s : null;
  }

  // Look for the ASIN across 4 sources in priority order:
  // 1. Active edition hidden <input> (updates live when you switch Kindle/Paperback)
  // 2. Current browser URL (location.href)
  // 3. Canonical <link rel="canonical"> tag in <head>
  // 4. Product container data-asin attributes
  function findAsin() {
    var inp = document.querySelector(
      'input#ASIN, input[name="ASIN"], input[name="ASIN.0"]'
    );
    var asin = validAsin(inp && inp.value);
    if (asin) return asin;

    asin = fromUrl(location.href);
    if (asin) return asin;

    var canonical = document.querySelector('link[rel="canonical"]');
    asin = fromUrl(canonical && canonical.href);
    if (asin) return asin;

    var containers = document.querySelectorAll(
      '#dp-container[data-asin], #cerberus-data-metrics[data-asin], [data-asin]'
    );
    for (var i = 0; i < containers.length; i++) {
      asin = validAsin(containers[i].getAttribute('data-asin'));
      if (asin) return asin;
    }

    return null;
  }

  // Show a non-blocking notification pill in the top-right corner for 2.2 seconds.
  function toast(message, ok) {
    var el = document.createElement('div');
    el.textContent = message;
    el.style.cssText =
      'position:fixed;top:16px;right:16px;z-index:2147483647;' +
      'padding:10px 14px;border-radius:8px;' +
      'font:600 14px/1.3 -apple-system,sans-serif;color:#fff;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.3);' +
      'background:' + (ok ? '#1f6f43' : '#a42828');
    document.body.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 2200);
  }

  // Safari-safe fallback clipboard copy using a temporary off-screen <textarea>.
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      // Ignore if execCommand is unavailable
    }
    ta.remove();
    return ok;
  }

  // Run extraction and copy the ASIN to the clipboard.
  var asin = findAsin();
  if (!asin) {
    toast('No Amazon DP/ASIN found on this page.', false);
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(asin).then(
      function () {
        toast('Copied ASIN: ' + asin, true);
      },
      function () {
        if (legacyCopy(asin)) toast('Copied ASIN: ' + asin, true);
        else window.prompt('Copy ASIN:', asin);
      }
    );
  } else if (legacyCopy(asin)) {
    toast('Copied ASIN: ' + asin, true);
  } else {
    window.prompt('Copy ASIN:', asin);
  }
})();
