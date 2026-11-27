/**
 * Amazon UK Wishlist Bookmarklet (readable, commented version)
 *
 * When clicked from your browser's bookmarks bar while viewing an Amazon UK
 * wishlist page, this script scrapes every loaded wishlist item on the page,
 * packages them as JSON, and copies the JSON to your clipboard so you can
 * paste it into BookList's "Compare with Amazon Wishlist" box.
 *
 * Note: Wrapped in an IIFE — (function () { ... })() — so variables stay
 * private and don't clash with Amazon's own page JavaScript.
 */

// Paste this in to a Safari shortcut
/**
javascript:(function()%7Bvar%20els%3Ddocument.querySelectorAll('li%5Bdata-itemid%5D')%3Bif(!els.length)%7Balert('Open%20your%20Amazon%20UK%20Wishlist%20and%20scroll%20down%20so%20items%20load%20first.')%3Breturn%3B%7Dvar%20out%3D%5B%5D%3Bels.forEach(function(li)%7Bvar%20a%3Dli.querySelector('a%5Bid%5E%3D%22itemName_%22%5D')%7C%7Cli.querySelector('a%5Bhref*%3D%22%2Fdp%2F%22%5D')%7C%7Cli.querySelector('a%5Bhref*%3D%22%2Fgp%2F%22%5D')%3Bvar%20href%3Da%3F(a.getAttribute('href')%7C%7C'')%3A''%3Bvar%20m%3Dhref.match(%2F%5C%2F(%3F%3Adp%7Cgp%5C%2Fproduct%7Cgp%5C%2Faw%5C%2Fd%7Cgp%5C%2Foffer-listing)%5C%2F(%5BA-Z0-9%5D%7B10%7D)%2Fi)%3Bif(!m)%7Bvar%20rp%3Dli.getAttribute('data-reposition-action-params')%7C%7C''%3Bm%3Drp.match(%2FASIN%3A(%5BA-Z0-9%5D%7B10%7D)%2Fi)%3B%7Dvar%20titleEl%3Da%7C%7Cli.querySelector('%5Bid%5E%3D%22itemName_%22%5D')%3Bvar%20title%3DtitleEl%3F(titleEl.getAttribute('title')%7C%7CtitleEl.textContent%7C%7C'').replace(%2F%5Cs%2B%2Fg%2C'%20').trim()%3A''%3Bif(!m%26%26!title)return%3Bvar%20by%3Dli.querySelector('%5Bid%5E%3D%22item-byline-%22%5D')%3Bvar%20dp%3Dli.getAttribute('data-price')%3Bvar%20pr%3Ddp%3FparseFloat(dp)%3Anull%3Bif(pr%3D%3D%3Dnull%7C%7CisNaN(pr))%7Bvar%20pe%3Dli.querySelector('.a-price%20.a-offscreen')%3Bif(pe)%7Bvar%20pm%3Dpe.textContent.replace(%2F%2C%2Fg%2C'').match(%2F(%5Cd%2B(%3F%3A%5C.%5Cd%7B1%2C2%7D)%3F)%2F)%3Bif(pm)pr%3DparseFloat(pm%5B1%5D)%3B%7D%7Dout.push(%7Basin%3Am%3Fm%5B1%5D.toUpperCase()%3A''%2Ctitle%3Atitle%2Cauthor%3Aby%3Fby.textContent.replace(%2F%5Eby%5Cs%2B%2Fi%2C'').replace(%2F%5Cs*%5C%7C%5Cs*Format%3A.*%24%2Fi%2C'').replace(%2F%5Cs*%5C(%5B%5E)%5D*(%3F%3AEdition%7CAuthor)%5B%5E)%5D*%5C)%2Fgi%2C'').trim()%3A''%2Cprice%3Apr%7D)%3B%7D)%3Bvar%20json%3DJSON.stringify(out)%3Bif(navigator.clipboard%26%26navigator.clipboard.writeText)%7Bnavigator.clipboard.writeText(json).then(function()%7Balert('Copied%20'%2Bout.length%2B'%20wishlist%20items!%20Paste%20them%20into%20BookList%20Compare.')%3B%7D%2Cfunction()%7Bwindow.prompt('Copy%20this%20JSON%20('%2Bout.length%2B'%20items)%3A'%2Cjson)%3B%7D)%3B%7Delse%7Bwindow.prompt('Copy%20this%20JSON%20('%2Bout.length%2B'%20items)%3A'%2Cjson)%3B%7D%7D)()%3B
*/

(function () {
    // 1. Find all wishlist item <li> elements currently loaded on the page.
    //    (Amazon lazy-loads items as you scroll, so you need to scroll down first.)
    var els = document.querySelectorAll('li[data-itemid]');
    if (!els.length) {
        alert('Open your Amazon UK Wishlist and scroll down so items load first.');
        return;
    }

    var out = [];

    // 2. Loop through each wishlist item element and extract ASIN, title, author, price.
    els.forEach(function (li) {
        // 2a. Find the item's product link element (try Amazon's itemName link first,
        //     then fall back to any /dp/ or /gp/ product link inside the <li>).
        var a =
            li.querySelector('a[id^="itemName_"]') ||
            li.querySelector('a[href*="/dp/"]') ||
            li.querySelector('a[href*="/gp/"]');

        var href = a ? a.getAttribute('href') || '' : '';

        // 2b. Extract the 10-character Amazon ASIN from the URL path:
        //     matches /dp/B00..., /gp/product/B00..., /gp/aw/d/B00..., or /gp/offer-listing/B00...
        var m = href.match(/\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing)\/([A-Z0-9]{10})/i);

        //     If the item has no product link (for example, a currently unavailable book),
        //     check Amazon's data-reposition-action-params attribute for "ASIN:B00...".
        if (!m) {
            var rp = li.getAttribute('data-reposition-action-params') || '';
            m = rp.match(/ASIN:([A-Z0-9]{10})/i);
        }

        // 2c. Read the book title (unavailable items may use a <span> instead of an <a>),
        //     collapsing any extra whitespace/newlines into single spaces.
        var titleEl = a || li.querySelector('[id^="itemName_"]');
        var title = titleEl
            ? (titleEl.getAttribute('title') || titleEl.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()
            : '';

        // Skip this row if we couldn't find either an ASIN or a title.
        if (!m && !title) return;

        // 2d. Find the author/byline element (e.g. "by David Quantick (Kindle Edition)").
        var by = li.querySelector('[id^="item-byline-"]');

        // 2e. Read the price: first check Amazon's numeric `data-price` attribute on <li>.
        var dp = li.getAttribute('data-price');
        var pr = dp ? parseFloat(dp) : null;

        //     If `data-price` is missing or invalid, read the visible price text
        //     (inside `.a-price .a-offscreen`, e.g. "£4.99") and extract the number.
        if (pr === null || isNaN(pr)) {
            var pe = li.querySelector('.a-price .a-offscreen');
            if (pe) {
                var pm = pe.textContent.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
                if (pm) pr = parseFloat(pm[1]);
            }
        }

        // 2f. Clean the author string (strip leading "by ", trailing "| Format: ...",
        //     and "(Kindle Edition)" / "(Author)" tags) and push the record.
        out.push({
            asin: m ? m[1].toUpperCase() : '',
            title: title,
            author: by
                ? by.textContent
                    .replace(/^by\s+/i, '')
                    .replace(/\s*\|\s*Format:.*$/i, '')
                    .replace(/\s*\([^)]*(?:Edition|Author)[^)]*\)/gi, '')
                    .trim()
                : '',
            price: pr,
        });
    });

    // 3. Convert the collected array to a JSON string and copy to the clipboard.
    //    Falls back to a window.prompt dialog if clipboard access is blocked.
    var json = JSON.stringify(out);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(
            function () {
                alert('Copied ' + out.length + ' wishlist items! Paste them into BookList Compare.');
            },
            function () {
                window.prompt('Copy this JSON (' + out.length + ' items):', json);
            }
        );
    } else {
        window.prompt('Copy this JSON (' + out.length + ' items):', json);
    }
})();
