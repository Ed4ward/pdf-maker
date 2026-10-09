import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import TopBar from "@/components/TopBar";
import Workspace, { type CompareView } from "@/components/Workspace";
import ThumbPanel from "@/components/ThumbPanel";
import StatusBar from "@/components/StatusBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { I18nProvider, useI18n } from "@/i18n";
import type { CompareMode, PageEntry, Replacement as WebReplacement, TextBoxPatch } from "@/types";
import type { DocState as ServerDocState } from "../src/contract.ts";
import { sourceResourceUri } from "../src/contract.ts";
import { api, onBridgeStatus, onDocState, onTheme, readResourceBase64, type BridgeStatus } from "./bridge";
import { compositePage, loadSource, renderBase, drawReplacement, loadImage } from "./pdf";

/**
 * Web Replacement 形状 = 服务端 Replacement + dataUrl(经资源通道取回)
 */
type UiReplacement = WebReplacement;

interface HydratedDoc {
  docId: string;
  fileName: string;
  pages: PageEntry[];
  replacements: Record<string, UiReplacement>;
  textBoxes: Array<{
    id: string;
    pageId: string;
    x: number;
    y: number;
    text: string;
    size: number;
    color: string;
  }>;
}

/** 服务端快照 → Web 组件所需的形状(替换图补 dataUrl) */
function hydrate(snapshot: ServerDocState, assetUrls: Record<string, string>): HydratedDoc {
  const replacements: Record<string, UiReplacement> = {};
  for (const [pageId, rep] of Object.entries(snapshot.replacements)) {
    replacements[pageId] = {
      ...rep,
      dataUrl: assetUrls[rep.assetId] ?? "",
    };
  }
  return {
    docId: snapshot.docId,
    fileName: snapshot.fileName,
    pages: snapshot.pages,
    replacements,
    textBoxes: snapshot.textBoxes,
  };
}

function ZcodeEditor() {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<ServerDocState | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [fulls, setFulls] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [previewSrc, setPreviewSrc] = useState("");
  const [compare, setCompare] = useState<CompareView | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [openPath, setOpenPath] = useState("");
  const [replaceDialog, setReplaceDialog] = useState(false);
  const [replacePath, setReplacePath] = useState("");
  const [exportDialog, setExportDialog] = useState(false);
  const [exportPath, setExportPath] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const renderToken = useRef(0);
  const thumbToken = useRef(0);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("connecting");

  useEffect(() => {
    const off = onBridgeStatus(setBridgeStatus);
    return () => void off();
  }, []);

  const hasDoc = !!snapshot;
  const currentEntry = snapshot?.pages[current] ?? null;
  const hydrated: HydratedDoc | null = snapshot ? hydrate(snapshot, assetUrls) : null;
  const replacement: UiReplacement | null =
    hydrated && currentEntry ? hydrated.replacements[currentEntry.id] ?? null : null;
  const currentTexts =
    hydrated && currentEntry
      ? hydrated.textBoxes.filter((t) => t.pageId === currentEntry.id)
      : [];
  const replacedCount = snapshot ? Object.keys(snapshot.replacements).length : 0;

  /* ---- 服务端快照入口(Agent 与面板共享) ---- */
  const applySnapshot = useCallback((next: ServerDocState) => {
    setSnapshot(next);
  }, []);

  useEffect(() => onDocState(applySnapshot), [applySnapshot]);

  useEffect(() => {
    onTheme(() => {
      const theme = (window as unknown as { zcodeHostTheme?: string }).zcodeHostTheme;
      document.documentElement.dataset.theme = theme ?? "light";
    });
  }, []);

  // 缺失的替换图资源 → 资源通道取回为 dataURL
  useEffect(() => {
    if (!snapshot) return;
    const missing = Object.values(snapshot.replacements).filter(
      (r) => !assetUrls[r.assetId],
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const rep of missing) {
        try {
          const { bytes, mime } = await readResourceBase64(
            `pdf://pdf-editor/${snapshot.docId}/asset/${rep.assetId}`,
          );
          const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
          if (cancelled) return;
          setAssetUrls((prev) => ({ ...prev, [rep.assetId]: url }));
        } catch (e) {
          console.error("asset load failed", e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot, assetUrls]);

  /* ---- 渲染:缩略图 / 高清页 ---- */

  const withSource = useCallback(
    async (fn: (pdfDoc: import("pdfjs-dist").PDFDocumentProxy) => Promise<void>) => {
      if (!snapshot) return;
      const { bytes } = await readResourceBase64(sourceResourceUri(snapshot.docId));
      const pdfDoc = await loadSource(snapshot.docId, bytes);
      await fn(pdfDoc);
    },
    [snapshot],
  );

  const ensureThumb = useCallback(
    async (entry: { id: string; srcIndex: number | null; w: number; h: number }) => {
      const snap = snapshot;
      if (!snap || thumbs[entry.id]) return;
      const token = ++thumbToken.current;
      try {
        await withSource(async (pdfDoc) => {
          const canvas = await renderBase(pdfDoc, entry, 140);
          const ctx = canvas.getContext("2d")!;
          const rep = snap.replacements[entry.id];
          if (rep && assetUrls[rep.assetId]) {
            const img = await loadImage(assetUrls[rep.assetId]);
            drawReplacement(ctx, img, canvas.width, canvas.height, rep);
          }
          if (token !== thumbToken.current) return;
          setThumbs((prev) => ({ ...prev, [entry.id]: canvas.toDataURL("image/jpeg", 0.82) }));
        });
      } catch (e) {
        console.error("thumb render failed", e);
      }
    },
    [snapshot, thumbs, assetUrls, withSource]
  );

  useEffect(() => {
    if (!snapshot) return;
    snapshot.pages.forEach((p) => void ensureThumb(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, assetUrls]);

  // 当前页高清渲染
  useEffect(() => {
    if (!snapshot || !currentEntry) {
      setPreviewSrc("");
      return;
    }
    const cached = fulls[currentEntry.id];
    if (cached) {
      setPreviewSrc(cached);
      return;
    }
    let cancelled = false;
    const token = ++renderToken.current;
    void (async () => {
      try {
        await withSource(async (pdfDoc) => {
          const canvas = await renderBase(pdfDoc, currentEntry, 1400);
          if (cancelled || token !== renderToken.current) return;
          setFulls((prev) => ({ ...prev, [currentEntry.id]: canvas.toDataURL("image/jpeg", 0.92) }));
        });
      } catch (e) {
        console.error("page render failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot, currentEntry, fulls, withSource]);

  /* ---- 工具调用包装 ---- */

  const run = useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      setDocLoading(true);
      try {
        await fn();
        if (success) toast.success(success);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setDocLoading(false);
      }
    },
    []
  );

  const handleAddText = useCallback(() => {
    if (!snapshot || !currentEntry) return;
    setCompare(null);
    void run(async () => {
      await api.addText(snapshot.docId, current, "输入文字", { x: 0.5, y: 0.45 });
    });
    // 新文字框 id 由快照返回;选中交给 onDocState 后的列表
  }, [snapshot, current, currentEntry, run]);

  /* ---- 对比 ---- */

  const openCompare = useCallback(
    async (mode: CompareMode = "side") => {
      const entry = currentEntry;
      const rep = replacement;
      if (!snapshot || !entry || !rep) return;
      setDocLoading(true);
      setLoadingText(t("loading.compare"));
      try {
        let before = fulls[entry.id];
        if (!before) {
          await withSource(async (pdfDoc) => {
            const canvas = await renderBase(pdfDoc, entry, 1400);
            before = canvas.toDataURL("image/jpeg", 0.92);
            setFulls((prev) => ({ ...prev, [entry.id]: before! }));
          });
        }
        setCompare({ index: current, mode, before: before!, after: rep });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setDocLoading(false);
      }
    },
    [current, currentEntry, fulls, replacement, snapshot, withSource, t]
  );

  /* ---- 导出(含文字页自动合成) ---- */

  const handleExport = useCallback(async () => {
    if (!snapshot || !hydrated) return;
    const path = exportPath.trim();
    if (!path) {
      toast.error(t("toast.needPath"));
      return;
    }
    setDocLoading(true);
    setLoadingText(t("loading.export"));
    try {
      await withSource(async (pdfDoc) => {
        for (const entry of snapshot.pages) {
          const texts = hydrated.textBoxes.filter((t) => t.pageId === entry.id);
          if (texts.length === 0) continue;
          const dataUrl = await compositePage(
            pdfDoc,
            entry,
            hydrated.replacements[entry.id],
            hydrated.textBoxes.filter((t) => t.pageId === entry.id),
          );
          await api.stage(snapshot.docId, entry.id, dataUrl);
        }
      });
      const result = await api.exportPdf(snapshot.docId, path, overwrite);
      toast.success(t("toast.exportedTo", { path: result.path }));
      setExportDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDocLoading(false);
    }
  }, [snapshot, hydrated, exportPath, overwrite, withSource, t]);

  /* ---- 文字/页面回调(映射到服务端工具) ---- */

  const handleMoveText = useCallback(
    (id: string, x: number, y: number, pushUndo: boolean) => {
      void pushUndo;
      if (!snapshot) return;
      void run(() => api.updateText(snapshot.docId, id, { x, y }));
    },
    [snapshot, run]
  );
  const handlePatchText = useCallback(
    (id: string, patch: TextBoxPatch) => {
      if (!snapshot) return;
      void run(() => api.updateText(snapshot.docId, id, patch));
    },
    [snapshot, run]
  );
  const handleCommitText = useCallback(
    (id: string, text: string) => {
      setEditingTextId(null);
      if (!snapshot) return;
      void run(() => api.updateText(snapshot.docId, id, { text }));
    },
    [snapshot, run]
  );
  const handleRemoveText = useCallback(
    (id: string) => {
      setSelectedTextId(null);
      setEditingTextId(null);
      if (!snapshot) return;
      void run(() => api.removeText(snapshot.docId, id));
    },
    [snapshot, run]
  );
  const handleRevert = useCallback(() => {
    if (!snapshot || !currentEntry) return;
    setCompare(null);
    void run(() => api.clearRep(snapshot.docId, current), t("toast.reverted").replace("第 {page} 页", String(current + 1)));
  }, [snapshot, current, currentEntry, run, t]);

  const loadingOverlay = docLoading ? (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3.5 bg-slate-100/75 backdrop-blur-[2px]">
      <div className="spinner" />
      <div className="text-[13px] text-slate-500">{loadingText || t("loading.default")}</div>
    </div>
  ) : null;

  if (!hydrated || !snapshot || !currentEntry) {
    // 空状态:打开工作区 PDF
    return (
      <I18nProvider>
        <TooltipProvider>
          <div className="flex h-dvh flex-col overflow-hidden">
            <TopBar
              hasDoc={false}
              canRevert={false}
              canCompare={false}
              canUndo={false}
              canExport={false}
              canDeletePage={false}
              hasEdits={false}
              currentPage={1}
              onOpen={() => setOpenDialog(true)}
              onAddPage={() => {}}
              onAddText={() => {}}
              onReplace={() => {}}
              onRevert={() => {}}
              onDeletePage={() => {}}
              onCompare={() => {}}
              onUndo={() => {}}
              onExport={() => {}}
            />
            <main className="flex min-h-0 flex-1">
              <div className="workspace-dots relative flex min-w-0 flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-3.5">
                  <div className="text-base font-semibold text-slate-800">
                    {t("panel.openHint")}
                  </div>
                  <Button onClick={() => setOpenDialog(true)}>{t("empty.open")}</Button>
                  <input
                    value={openPath}
                    onChange={(e) => setOpenPath(e.target.value)}
                    placeholder={t("panel.pathPlaceholder")}
                    className="w-72 rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
            </main>
            {loadingOverlay}
            <PathDialog />
            <BridgeBadge status={bridgeStatus} />
            <Toaster position="bottom-center" richColors />
          </div>
        </TooltipProvider>
      </I18nProvider>
    );
  }

  function PathDialog() {
    return (
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("panel.openTitle")}</DialogTitle>
            <DialogDescription>{t("panel.openDesc")}</DialogDescription>
          </DialogHeader>
          <input
            value={openPath}
            onChange={(e) => setOpenPath(e.target.value)}
            placeholder={t("panel.pathPlaceholder")}
            className="h-9 w-full rounded-md border px-3 text-sm outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && openPath.trim()) {
                const p = openPath.trim();
                setOpenDialog(false);
                void run(async () => applySnapshot(await api.load(p)), t("toast.openedShort"));
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              {t("dialog.cancel")}
            </Button>
            <Button
              disabled={!openPath.trim()}
              onClick={() => {
                const p = openPath.trim();
                setOpenDialog(false);
                void run(async () => applySnapshot(await api.load(p)), t("toast.openedShort"));
              }}
            >
              {t("empty.open")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col overflow-hidden">
        <TopBar
          hasDoc={hasDoc}
          canRevert={!!replacement}
          canCompare={!!replacement}
          canUndo={false}
          canExport={replacedCount > 0 || hydrated.textBoxes.length > 0}
          canDeletePage={snapshot.pages.length > 1}
          hasEdits={replacedCount > 0 || hydrated.textBoxes.length > 0}
          currentPage={current + 1}
          onOpen={() => setOpenDialog(true)}
          onAddPage={() =>
            snapshot && void run(() => api.addBlank(snapshot.docId, current), t("toast.pageAddedShort"))
          }
          onAddText={handleAddText}
          onReplace={() => setReplaceDialog(true)}
          onRevert={handleRevert}
          onDeletePage={() => {
            if (!snapshot) return;
            setCompare(null);
            setSelectedTextId(null);
            setEditingTextId(null);
            void run(() => api.deletePage(snapshot.docId, current), t("toast.pageDeletedShort"));
          }}
          onCompare={() => (compare ? setCompare(null) : void openCompare())}
          onUndo={() => toast.info(t("panel.noUndo"))}
          onExport={() => setExportDialog(true)}
        />

        <main className="flex min-h-0 flex-1 flex-col md:flex-row">
          <Workspace
            hasDoc={hasDoc}
            docLoading={docLoading}
            loadingText={loadingText}
            pageInfo={currentEntry}
            previewSrc={replacement ? replacement.dataUrl : previewSrc}
            replacement={replacement}
            textBoxes={currentTexts}
            selectedTextId={selectedTextId}
            editingTextId={editingTextId}
            zoom={zoom}
            compare={compare}
            onZoom={(value) => setZoom(value)}
            onAdjust={(patch, pushUndo) => {
              void pushUndo;
              if (!snapshot) return;
              void run(() => api.setLayout(snapshot.docId, current, patch));
            }}
            onSelectText={setSelectedTextId}
            onStartEditText={(id) => {
              setSelectedTextId(id);
              setEditingTextId(id);
            }}
            onCommitText={handleCommitText}
            onMoveText={handleMoveText}
            onPatchText={handlePatchText}
            onRemoveText={handleRemoveText}
            onCompareMode={(mode) => setCompare((c) => (c ? { ...c, mode } : c))}
            onExitCompare={() => setCompare(null)}
            onOpen={() => setOpenDialog(true)}
            onDropFile={() => toast.info(t("panel.dropUnsupported"))}
          />
          <ThumbPanel
            entries={snapshot.pages}
            thumbs={thumbs}
            replacements={hydrated.replacements}
            textBoxes={hydrated.textBoxes}
            current={current}
            onSelect={(idx) => {
              setCurrent(idx);
              setSelectedTextId(null);
            }}
            onMovePage={(from, to) => {
              if (!snapshot) return;
              void run(() => api.movePage(snapshot.docId, from, to));
            }}
          />
        </main>

        <StatusBar
          fileName={snapshot.fileName}
          current={current}
          total={snapshot.pages.length}
          replacedCount={replacedCount}
          zoom={zoom}
        />

        {/* 打开路径对话框 */}
        <PathDialog />

        {/* 替换图路径对话框 */}
        <Dialog open={replaceDialog} onOpenChange={setReplaceDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("panel.replaceTitle")}</DialogTitle>
              <DialogDescription>{t("panel.replaceDesc")}</DialogDescription>
            </DialogHeader>
            <input
              value={replacePath}
              onChange={(e) => setReplacePath(e.target.value)}
              placeholder="images/new-cover.png"
              className="h-9 w-full rounded-md border px-3 text-sm outline-none focus:border-primary"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setReplaceDialog(false)}>
                {t("dialog.cancel")}
              </Button>
              <Button
                disabled={!replacePath.trim()}
                onClick={() => {
                  const p = replacePath.trim();
                  setReplaceDialog(false);
                  setCurrent(current);
                  void run(
                    () => api.replace(snapshot!.docId, current, p),
                    t("toast.replacedShort"),
                  );
                }}
              >
                {t("topbar.replace")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 导出对话框 */}
        <Dialog open={exportDialog} onOpenChange={setExportDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("panel.exportTitle")}</DialogTitle>
              <DialogDescription>{t("panel.exportDesc")}</DialogDescription>
            </DialogHeader>
            <input
              value={exportPath}
              onChange={(e) => setExportPath(e.target.value)}
              placeholder={suggestExport(snapshot.fileName)}
              className="h-9 w-full rounded-md border px-3 text-sm outline-none focus:border-primary"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              {t("panel.overwrite")}
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExportDialog(false)}>
                {t("dialog.cancel")}
              </Button>
              <Button disabled={!exportPath.trim()} onClick={() => void handleExport()}>
                {t("topbar.export")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <BridgeBadge status={bridgeStatus} />
        <Toaster position="bottom-center" richColors />
      </div>
    </TooltipProvider>
  );

  function suggestExport(name: string) {
    return name.replace(/\.pdf$/i, "") + "-edited.pdf";
  }
}


function BridgeBadge({ status }: { status: BridgeStatus }) {
  if (status === "connected") return null;
  const text =
    status === "failed"
      ? "无法连接宿主:当前 ZCode 可能不支持插件面板,请在对话中让 Agent 直接操作"
      : "面板连接宿主中…";
  return (
    <div
      className={
        "fixed bottom-2 left-2 z-[200] rounded-full px-3 py-1 text-xs shadow " +
        (status === "failed"
          ? "bg-red-600 text-white"
          : "bg-slate-900/80 text-slate-100")
      }
    >
      {text}
    </div>
  );
}

export default function ZcodePluginApp() {
  return (
    <I18nProvider>
      <TooltipProvider>
        <ZcodeEditor />
      </TooltipProvider>
    </I18nProvider>
  );
}
