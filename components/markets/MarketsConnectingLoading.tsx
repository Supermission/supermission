/**
 * MarketsConnectingLoading
 *
 * Skeleton loader for /markets routes. Uses an inline script to read dark mode
 * from localStorage BEFORE React hydrates, preventing flash of wrong theme.
 * All styling is CSS-based via [data-dark="true"] selector.
 */

export function MarketsConnectingLoading() {
  // Inline script sets data-dark attribute synchronously before paint
  const inlineScript = `
    (function(){
      var d=localStorage.getItem('sm:markets-dark-mode')==='1';
      document.getElementById('markets-skeleton').setAttribute('data-dark',d);
    })();
  `;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            #markets-skeleton{background:#fff;color:#1a1a1a}
            #markets-skeleton[data-dark="true"]{background:#121212;color:#fff}
            #markets-skeleton .skel-header{border-color:#e5e7eb}
            #markets-skeleton[data-dark="true"] .skel-header{border-color:rgba(255,255,255,0.08)}
            /* Neutral skeleton fills unified with the shared <Skeleton> primitive:
               light #eceef1, dark rgba(255,255,255,0.06). */
            #markets-skeleton .skel-bar{background:#eceef1}
            #markets-skeleton[data-dark="true"] .skel-bar{background:rgba(255,255,255,0.06)}
            #markets-skeleton .skel-bar-sm{background:#eceef1}
            #markets-skeleton[data-dark="true"] .skel-bar-sm{background:rgba(255,255,255,0.06)}
            #markets-skeleton .skel-card{border-color:rgba(0,0,0,0.08);background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
            #markets-skeleton[data-dark="true"] .skel-card{border-color:rgba(255,255,255,0.12);background:rgba(255,255,255,0.045);box-shadow:none}
            #markets-skeleton .skel-line{background:#eceef1}
            #markets-skeleton[data-dark="true"] .skel-line{background:rgba(255,255,255,0.06)}
            #markets-skeleton .skel-line-sm{background:#eceef1}
            #markets-skeleton[data-dark="true"] .skel-line-sm{background:rgba(255,255,255,0.06)}
            #markets-skeleton .skel-progress{background:#eceef1}
            #markets-skeleton[data-dark="true"] .skel-progress{background:rgba(255,255,255,0.06)}
            #markets-skeleton .skel-progress-bar{background:#eceef1}
            #markets-skeleton[data-dark="true"] .skel-progress-bar{background:rgba(255,255,255,0.06)}
            #markets-skeleton .skel-divider{background:#eceef1}
            #markets-skeleton[data-dark="true"] .skel-divider{background:rgba(255,255,255,0.06)}
            #markets-skeleton .skel-spinner{border-color:rgba(0,0,0,0.2);border-top-color:rgba(0,0,0,0.7)}
            #markets-skeleton[data-dark="true"] .skel-spinner{border-color:rgba(255,255,255,0.2);border-top-color:rgba(255,255,255,0.7)}
            #markets-skeleton .skel-text{color:rgba(0,0,0,0.55)}
            #markets-skeleton[data-dark="true"] .skel-text{color:rgba(255,255,255,0.62)}
            #markets-skeleton .skel-btn-yes{background:rgba(16,185,129,0.1)}
            #markets-skeleton[data-dark="true"] .skel-btn-yes{background:rgba(52,211,153,0.14)}
            #markets-skeleton .skel-btn-no{background:rgba(244,63,94,0.1)}
            #markets-skeleton[data-dark="true"] .skel-btn-no{background:rgba(251,113,133,0.14)}
          `,
        }}
      />
      <div id="markets-skeleton" className="min-h-screen transition-colors">
        <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
        <div className="flex min-h-screen flex-col">
          <div className="skel-header flex items-center gap-3 border-b px-4 py-3">
            <div className="skel-bar h-5 w-32 animate-pulse rounded-[4px]" />
            <div className="ml-auto flex gap-2">
              <div className="skel-bar-sm h-7 w-20 animate-pulse rounded-[6px]" />
              <div className="skel-bar-sm h-7 w-20 animate-pulse rounded-[6px]" />
              <div className="skel-bar-sm h-7 w-20 animate-pulse rounded-[6px]" />
            </div>
          </div>
          <div className="flex-1 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="skel-spinner h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
              <span className="skel-text font-mono text-[10px] font-semibold uppercase tracking-wider">
                Loading markets
              </span>
              <div className="skel-divider h-px flex-1" />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skel-card animate-pulse rounded-[8px] border">
                  <div className="p-4 pb-3">
                    <div className="skel-line mb-2 h-4 w-[85%] rounded-[4px]" />
                    <div className="skel-line-sm mb-3 h-4 w-[60%] rounded-[4px]" />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="skel-progress h-3 w-8 rounded-[4px]" />
                        <div className="skel-progress-bar h-[6px] flex-1 rounded-[4px]" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="skel-progress h-3 w-8 rounded-[4px]" />
                        <div className="skel-progress-bar h-[6px] flex-1 rounded-[4px]" />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 px-4 pb-4 pt-1">
                    <div className="skel-btn-yes h-9 flex-1 rounded-[6px]" />
                    <div className="skel-btn-no h-9 flex-1 rounded-[6px]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
