"use client";

import { DEFAULT_BG_COLOR, type EmailFooter, wrapEmailHtml } from "@/lib/render";
import { extractVariables } from "@/lib/template-vars";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DataObjectIcon from "@mui/icons-material/DataObject";
import SaveIcon from "@mui/icons-material/Save";
import SettingsIcon from "@mui/icons-material/Settings";
import VisibilityIcon from "@mui/icons-material/Visibility";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Snackbar,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AttachmentsStrip, { type Attachment } from "./attachments-strip";
import ComposerToolbar from "./composer-toolbar";
import { GHOST_BTN } from "./dashboard-ui";
import { GlassCard } from "./glass-card";
import LixEditor from "./lix-editor";
import { useRole } from "./role-provider";

const ACCENT = "var(--accent)";
const TEXT_60 = "var(--fg-muted)";

// Common email canvas colours offered as quick swatches (plus a custom picker).
const BG_PRESETS = ["#f4f4f7", "#ffffff", "#eef2ff", "#f0fdf4", "#0b0d12"];

// Email clients don't render diagrams/equations/PDF/TOC/syntax-highlighting —
// keep the editor focused on what survives in an inbox.
const EMAIL_FEATURES = {
    equations: false,
    mermaid: false,
    tableOfContents: false,
    pdf: false,
    codeHighlighting: false,
    linkPreview: false,
    dates: false,
    images: true,
    buttons: true,
    markdownLinks: true,
};

const darkField = {
    "& .MuiOutlinedInput-root": {
        color: "var(--fg)",
        borderRadius: "10px",
        background: "var(--field-bg)",
        "& fieldset": { borderColor: "var(--field-border)" },
        "&:hover fieldset": { borderColor: "var(--accent-border)" },
        "&.Mui-focused fieldset": { borderColor: ACCENT },
    },
    "& .MuiInputBase-input": { fontSize: "0.86rem", py: 0.7 },
    "& .MuiInputBase-input::placeholder": { color: "var(--fg-faint)", opacity: 1 },
};

const SAVE_BTN_SX = {
    textTransform: "none" as const,
    fontWeight: 700,
    fontSize: "0.9rem",
    color: "var(--accent-contrast)",
    px: 2.6,
    py: 1.1,
    borderRadius: "10px",
    background: "var(--accent-gradient)",
    boxShadow: "0 6px 18px var(--accent-shadow)",
    "&:hover": { background: "var(--accent-gradient-hover)" },
    "&.Mui-disabled": { background: "var(--overlay)", color: "var(--fg-faint)" },
};

/**
 * lixeditor `uploadFile` hook: send a dropped/pasted image to our host upload
 * endpoint and return the optimized Cloudinary URL (never base64 in the email).
 */
async function uploadTemplateImage(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads/image", { method: "POST", body: form });
    const d: any = await res.json().catch(() => ({}));
    if (!res.ok || !d?.url) throw new Error(d?.message || d?.error || "Image upload failed");
    return d.url as string;
}

export default function TemplateComposer({ templateId }: { templateId?: string }) {
    const { canWrite } = useRole();
    const router = useRouter();
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [subject, setSubject] = useState("");
    const [initialContent, setInitialContent] = useState<any[] | undefined>(undefined);
    const [blocks, setBlocks] = useState<any[]>([]);
    const apiRef = useRef<any>(null);
    // Images uploaded during this edit session — sent on save so the server can
    // delete any that didn't end up in the final content.
    const uploadedImagesRef = useRef<string[]>([]);

    // Single upload path for both drag/drop/paste (editor hook) and the toolbar:
    // upload to Cloudinary and remember the URL for cleanup.
    const handleUpload = useCallback(async (file: File) => {
        const url = await uploadTemplateImage(file);
        uploadedImagesRef.current.push(url);
        return url;
    }, []);

    const [loading, setLoading] = useState(Boolean(templateId));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState(false);

    // Email canvas colour + true-to-inbox preview.
    const [bgColor, setBgColor] = useState(DEFAULT_BG_COLOR);
    const [viewMode, setViewMode] = useState<"editor" | "split" | "preview">("split");
    const showPreview = viewMode !== "editor";
    const [previewHtml, setPreviewHtml] = useState("");
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [footer, setFooter] = useState<EmailFooter | null>(null);
    const [editorReady, setEditorReady] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const previewRef = useRef<HTMLIFrameElement | null>(null);
    // Content source: the visual editor, or hand-written HTML that is saved as-is
    // (never re-rendered by the editor, so custom styling survives).
    const [contentMode, setContentMode] = useState<"editor" | "html">("editor");
    const [rawHtml, setRawHtml] = useState("");
    const [confirmVisual, setConfirmVisual] = useState(false);
    // The HTML as saved, plus the editor document it was loaded with. A template
    // can hold hand-styled HTML that the editor document only approximates.
    const savedHtmlRef = useRef("");
    const loadedBlocksSigRef = useRef<string | null>(null);

    const syncPreviewScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        const source = event.currentTarget;
        const frameWindow = previewRef.current?.contentWindow;
        const frameDocument = previewRef.current?.contentDocument;
        if (!frameWindow || !frameDocument) return;
        const sourceRange = source.scrollHeight - source.clientHeight;
        const target = frameDocument.scrollingElement || frameDocument.documentElement;
        const targetRange = target.scrollHeight - frameWindow.innerHeight;
        if (sourceRange > 0 && targetRange > 0) {
            frameWindow.scrollTo({ top: (source.scrollTop / sourceRange) * targetRange });
        }
    }, []);

    // The preview footer comes straight from the template: GET /api/templates/:id
    // returns the product's footer for webhook templates and the template's own
    // footer (footer_json) for one-time templates. Both are configured on the
    // Settings page; here we only render what the template resolves to.
    useEffect(() => {
        if (!templateId) return;
        let alive = true;
        fetch(`/api/templates/${templateId}`)
            .then((r) => r.json())
            .then((d: any) => {
                if (!alive) return;
                if (d?.ok) {
                    const t = d.template;
                    setName(t.name || "");
                    setSlug(t.slug || "");
                    setSubject(t.subject || "");
                    setBgColor(t.bg_color || DEFAULT_BG_COLOR);
                    setAttachments(
                        Array.isArray(t.attachments) ? (t.attachments as Attachment[]) : [],
                    );
                    setFooter(t.footer ?? null);
                    setInitialContent(Array.isArray(t.content) ? t.content : undefined);
                    savedHtmlRef.current = t.content_html || "";
                    if (t.content_mode === "html") {
                        setContentMode("html");
                        setRawHtml(t.content_html || "");
                    }
                    setBlocks(Array.isArray(t.content) ? t.content : []);
                } else {
                    setError("Could not load this template.");
                }
            })
            .catch(() => alive && setError("Could not load this template."))
            .finally(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, [templateId]);

    // Live {{variable}} detection from the subject + editor content.
    // Variable names referenced in the subject/body. We recompute as the body
    // changes, but keep the ARRAY REFERENCE stable until the *set* of names
    // actually changes — otherwise every keystroke handed the editor a fresh
    // `variableSuggestions` array, which re-initialised it and reset the caret.
    const variableKey = useMemo(
        () =>
            extractVariables(
                subject,
                contentMode === "html" ? rawHtml : JSON.stringify(blocks),
            ).join(" "),
        [subject, blocks, contentMode, rawHtml],
    );
    const variables = useMemo(() => (variableKey ? variableKey.split(" ") : []), [variableKey]);

    // Stable identities for every non-primitive editor prop. The composer
    // re-renders on each keystroke (setBlocks), so any inline object/callback
    // here would be a fresh reference each time and re-initialise the editor.
    const buttonDefaults = useMemo(() => ({ color: "#7c5cff", align: "left" as const }), []);
    const handleEditorReady = useCallback((api: any) => {
        apiRef.current = api;
        setEditorReady(true);
    }, []);
    const handleEditorChange = useCallback((ed: any) => setBlocks(ed?.document ?? []), []);

    // Gate saving: require a name + subject and a non-trivial body. Templates are
    // attached to products via webhooks (configured on the product), not here.
    const bodyText = useMemo(
        () =>
            contentMode === "html"
                ? rawHtml
                      .replace(/<style[\s\S]*?<\/style>/gi, " ")
                      .replace(/<[^>]*>/g, " ")
                      .replace(/\s+/g, " ")
                      .trim()
                : blocksToPlainText(blocks),
        [blocks, contentMode, rawHtml],
    );
    const canSave = name.trim().length > 0 && subject.trim().length > 0 && bodyText.length > 2;

    // Dirty tracking: grey out "Save changes" when nothing has changed since the
    // template was loaded (or last saved). The baseline is captured once the
    // editor has mounted and emitted its initial content.
    const currentSig = useMemo(
        () =>
            JSON.stringify({
                name,
                slug,
                subject,
                bgColor,
                attachments,
                contentMode,
                body: contentMode === "html" ? rawHtml : blocks,
            }),
        [name, slug, subject, blocks, bgColor, attachments, contentMode, rawHtml],
    );
    const baselineSigRef = useRef<string | null>(null);
    useEffect(() => {
        if (editorReady && baselineSigRef.current === null) {
            baselineSigRef.current = currentSig;
            loadedBlocksSigRef.current = JSON.stringify(blocks);
        }
    }, [editorReady, currentSig]);
    const dirty = baselineSigRef.current !== null && currentSig !== baselineSigRef.current;

    // Debounced true-to-inbox preview: drop the editor's email-safe HTML into the
    // real email shell (chosen canvas colour + white card) so the user sees what
    // the recipient will see. {{variables}} are left literal in the preview.
    useEffect(() => {
        if (!showPreview) return;
        const id = setTimeout(() => {
            try {
                const html =
                    contentMode === "html"
                        ? rawHtml
                        : apiRef.current
                          ? apiRef.current.getHTML()
                          : "";
                setPreviewHtml(wrapEmailHtml(html, bgColor, footer));
            } catch {
                /* editor not mounted yet */
            }
        }, 350);
        return () => clearTimeout(id);
    }, [blocks, bgColor, showPreview, footer, editorReady, contentMode, rawHtml]);

    // Visual → HTML. If the visual content is untouched since loading, start
    // from the SAVED HTML — it may be hand-styled HTML that the editor document
    // only approximates (re-rendering would silently drop the styling).
    // Otherwise start from what the editor would send now.
    async function switchToHtml() {
        const untouched =
            loadedBlocksSigRef.current !== null &&
            JSON.stringify(blocks) === loadedBlocksSigRef.current;
        if (untouched && savedHtmlRef.current) {
            setRawHtml(savedHtmlRef.current);
        } else {
            try {
                const html = apiRef.current ? await apiRef.current.getHTML() : "";
                setRawHtml(html || rawHtml);
            } catch {
                /* keep whatever HTML we had */
            }
        }
        setContentMode("html");
    }

    // HTML → Visual: import the HTML into the editor. Custom styling (tables,
    // inline CSS, <style>) is simplified to editor blocks — hence the confirm.
    async function switchToVisual() {
        setConfirmVisual(false);
        try {
            const editor = apiRef.current?.getEditor?.();
            if (editor?.tryParseHTMLToBlocks) {
                const parsed = await editor.tryParseHTMLToBlocks(rawHtml);
                editor.replaceBlocks(
                    editor.document,
                    parsed.length ? parsed : [{ type: "paragraph" }],
                );
                setBlocks(editor.document);
            }
        } catch {
            setToast("Couldn't convert all of the HTML — check the content.");
        }
        setContentMode("editor");
    }

    async function save() {
        if (saving) return;
        if (!name.trim()) {
            setError("Give the template a name.");
            return;
        }
        setSaving(true);
        setError(null);
        setSavedMsg(false);
        try {
            const htmlMode = contentMode === "html";
            const contentJson = htmlMode
                ? null
                : apiRef.current
                  ? apiRef.current.getBlocks()
                  : blocks;
            const contentHtml = htmlMode
                ? rawHtml
                : apiRef.current
                  ? await apiRef.current.getHTML()
                  : "";
            const payload: any = {
                name: name.trim(),
                slug: slug.trim() || undefined,
                subject,
                contentMode,
                contentJson,
                contentHtml,
                bgColor,
                uploadedImages: uploadedImagesRef.current,
                attachments: attachments.map((a) => ({
                    kind: a.kind,
                    source: a.source,
                    filename: a.filename,
                    mime: a.mime,
                })),
            };
            const url = templateId ? `/api/templates/${templateId}` : "/api/templates";
            const res = await fetch(url, {
                method: templateId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const d: any = await res.json().catch(() => ({}));
            if (!res.ok || !d?.ok) throw new Error(d?.message || d?.error || "Could not save.");
            if (!templateId && d.template?.id) {
                router.replace(`/dashboard/templates/${d.template.id}`);
            } else {
                // Re-baseline so the freshly-saved state reads as clean.
                baselineSigRef.current = currentSig;
                setSavedMsg(true);
                setTimeout(() => setSavedMsg(false), 2500);
            }
        } catch (e: any) {
            setError(e?.message || "Could not save.");
        } finally {
            setSaving(false);
        }
    }

    // ⌘/Ctrl+S saves. Refs keep the latest save + gate without re-binding the listener.
    const saveRef = useRef<() => void>(() => {});
    const canSaveRef = useRef(false);
    saveRef.current = save;
    canSaveRef.current = canSave && !saving;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                if (canSaveRef.current) saveRef.current();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: "grid", placeItems: "center", minHeight: 320 }}>
                <CircularProgress sx={{ color: ACCENT }} />
            </Box>
        );
    }

    return (
        // Full-bleed: break out of the dashboard's max-width container and fill
        // the viewport so the editor + preview sit side by side in one screen.
        <Box
            sx={{
                width: "100vw",
                ml: "calc(50% - 50vw)",
                px: { xs: 2, md: 3 },
                display: "flex",
                flexDirection: "column",
                height: { xs: "auto", lg: "calc(100vh - 140px)" },
                minHeight: { lg: 560 },
            }}
        >
            {/* Compact header */}
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1, gap: 2, flexShrink: 0 }}
            >
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
                    <Button
                        component={Link}
                        href="/dashboard/templates"
                        startIcon={<ArrowBackIcon sx={{ fontSize: "1.1rem !important" }} />}
                        sx={{
                            textTransform: "none",
                            color: TEXT_60,
                            minWidth: 0,
                            "&:hover": { color: "var(--fg)" },
                        }}
                    >
                        Templates
                    </Button>
                    <Typography
                        sx={{
                            fontWeight: 800,
                            fontSize: "1.12rem",
                            color: "var(--fg)",
                            letterSpacing: "-0.01em",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {templateId ? name || "Edit template" : "New template"}
                    </Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                    <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={viewMode}
                        onChange={(_, value) => value && setViewMode(value)}
                        aria-label="Editor layout"
                        sx={{
                            "& .MuiToggleButton-root": {
                                color: "var(--fg-muted)",
                                borderColor: "var(--border)",
                                px: 1.25,
                                py: 0.55,
                                textTransform: "none",
                                fontSize: "0.75rem",
                            },
                            "& .Mui-selected": {
                                color: "var(--accent) !important",
                                bgcolor: "var(--accent-tint) !important",
                            },
                        }}
                    >
                        <ToggleButton value="editor">Editor</ToggleButton>
                        <ToggleButton value="split">Split</ToggleButton>
                        <ToggleButton value="preview">Preview</ToggleButton>
                    </ToggleButtonGroup>
                    {savedMsg && (
                        <Typography sx={{ color: "var(--success)", fontSize: "0.85rem" }}>
                            Saved
                        </Typography>
                    )}
                    {templateId && (
                        <Button
                            component={Link}
                            href={`/dashboard/templates/${templateId}/settings`}
                            startIcon={<SettingsIcon sx={{ fontSize: "1.05rem !important" }} />}
                            sx={{ ...GHOST_BTN, fontSize: "0.9rem" }}
                        >
                            Settings
                        </Button>
                    )}
                    {canWrite && (
                        <Tooltip
                            title={
                                !canSave
                                    ? "Add a name, subject, and some body content"
                                    : !dirty
                                      ? "No changes to save"
                                      : ""
                            }
                            arrow
                            disableHoverListener={canSave && dirty}
                        >
                            <span>
                                <Button
                                    onClick={save}
                                    disabled={saving || !canSave || !dirty}
                                    startIcon={
                                        saving ? (
                                            <CircularProgress
                                                size={16}
                                                sx={{ color: "var(--fg-muted)" }}
                                            />
                                        ) : (
                                            <SaveIcon sx={{ fontSize: "1.1rem !important" }} />
                                        )
                                    }
                                    sx={SAVE_BTN_SX}
                                >
                                    {templateId ? "Save changes" : "Create template"}
                                </Button>
                            </span>
                        </Tooltip>
                    )}
                </Stack>
            </Stack>

            {error && (
                <Box
                    sx={{
                        mb: 1.5,
                        px: 2,
                        py: 1,
                        borderRadius: "10px",
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "var(--danger)",
                        fontSize: "0.85rem",
                        flexShrink: 0,
                    }}
                >
                    {error}
                </Box>
            )}

            {/* Variables — top strip */}
            <Stack
                direction="row"
                alignItems="center"
                sx={{ mb: 1, flexWrap: "wrap", gap: 0.7, flexShrink: 0 }}
            >
                <DataObjectIcon sx={{ fontSize: 17, color: ACCENT, mr: 0.4 }} />
                <Typography
                    sx={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--fg)", mr: 0.5 }}
                >
                    Variables{variables.length > 0 ? ` (${variables.length})` : ""}
                </Typography>
                {variables.length > 0 ? (
                    variables.map((v) => (
                        <Chip
                            key={v}
                            label={`{{${v}}}`}
                            size="small"
                            sx={{
                                height: 22,
                                fontFamily: "var(--font-geist-mono)",
                                fontSize: "0.72rem",
                                color: "var(--accent)",
                                bgcolor: "var(--accent-tint)",
                                border: "1px solid var(--accent-border)",
                            }}
                        />
                    ))
                ) : (
                    <Typography sx={{ color: TEXT_60, fontSize: "0.8rem" }}>
                        — type{" "}
                        <Box
                            component="span"
                            sx={{ fontFamily: "var(--font-geist-mono)", color: "var(--success)" }}
                        >
                            {"{{name}}"}
                        </Box>{" "}
                        in the subject or body to add one
                    </Typography>
                )}
            </Stack>

            {/* Workspace: compose | inbox preview */}
            <Box
                sx={{
                    display: "flex",
                    flexDirection: { xs: "column", lg: "row" },
                    gap: 2,
                    flex: 1,
                    minHeight: 0,
                }}
            >
                {/* LEFT — compose (metadata header + editor + toolbar) */}
                <GlassCard
                    sx={{
                        p: 0,
                        overflow: "hidden",
                        flexDirection: "column",
                        flex: 1,
                        minWidth: 0,
                        minHeight: { xs: 540, lg: 0 },
                        display: viewMode === "preview" ? "none" : "flex",
                    }}
                >
                    <Box
                        sx={{
                            p: 1.1,
                            borderBottom: "1px solid var(--border)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.9,
                            flexShrink: 0,
                        }}
                    >
                        <Box
                            sx={{
                                display: "grid",
                                gap: 0.9,
                                gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" },
                            }}
                        >
                            <TextField
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Template name"
                                fullWidth
                                size="small"
                                sx={darkField}
                            />
                            <TextField
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="slug (auto)"
                                fullWidth
                                size="small"
                                sx={darkField}
                            />
                        </Box>
                        <TextField
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Subject line — supports {{variables}}"
                            fullWidth
                            size="small"
                            sx={darkField}
                        />
                        <Stack
                            direction="row"
                            spacing={1.2}
                            alignItems="center"
                            flexWrap="wrap"
                            useFlexGap
                        >
                            <ToggleButtonGroup
                                size="small"
                                exclusive
                                value={contentMode}
                                disabled={!canWrite}
                                onChange={(_, v) => {
                                    if (v === "html" && contentMode !== "html") switchToHtml();
                                    if (v === "editor" && contentMode !== "editor")
                                        setConfirmVisual(true);
                                }}
                                aria-label="Content format"
                                sx={{
                                    "& .MuiToggleButton-root": {
                                        textTransform: "none",
                                        fontWeight: 600,
                                        fontSize: "0.78rem",
                                        px: 1.4,
                                        py: 0.3,
                                        color: TEXT_60,
                                        borderColor: "var(--border)",
                                    },
                                    "& .Mui-selected": {
                                        color: "var(--fg) !important",
                                        background: "var(--overlay) !important",
                                    },
                                }}
                            >
                                <ToggleButton value="editor">Visual</ToggleButton>
                                <ToggleButton value="html">HTML</ToggleButton>
                            </ToggleButtonGroup>
                            <Typography sx={{ fontSize: "0.74rem", color: TEXT_60 }}>
                                {contentMode === "html"
                                    ? "Raw HTML — sent exactly as written (scripts and event handlers are removed on save)."
                                    : "Visual editor — or switch to HTML to paste a fully designed email."}
                            </Typography>
                        </Stack>
                    </Box>

                    {/* Editor body — scrolls. Extra left padding keeps BlockNote's
                        block handles (+ / drag), which sit in a left gutter, in view. */}
                    {contentMode === "html" && (
                        <Box
                            sx={{
                                // Takes the space left above the toolbar/attachments
                                // strip; the textarea scrolls inside it instead of
                                // overflowing underneath the strip.
                                flex: 1,
                                minHeight: { xs: 360, lg: 0 },
                                display: "flex",
                                overflow: "hidden",
                                p: { xs: 1.2, md: 1.6 },
                            }}
                        >
                            <Box
                                component="textarea"
                                value={rawHtml}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                    setRawHtml(e.target.value)
                                }
                                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                                    // Tab inserts indentation instead of leaving the field.
                                    if (e.key === "Tab") {
                                        e.preventDefault();
                                        const el = e.currentTarget;
                                        const { selectionStart: a, selectionEnd: b } = el;
                                        const next = `${rawHtml.slice(0, a)}  ${rawHtml.slice(b)}`;
                                        setRawHtml(next);
                                        requestAnimationFrame(() =>
                                            el.setSelectionRange(a + 2, a + 2),
                                        );
                                    }
                                }}
                                readOnly={!canWrite}
                                spellCheck={false}
                                aria-label="Template HTML"
                                placeholder={
                                    '<table role="presentation" width="100%">…</table>\n\nPaste or write your email HTML. Use {{variables}} anywhere.'
                                }
                                sx={{
                                    flex: 1,
                                    width: "100%",
                                    height: "100%",
                                    minHeight: 0,
                                    overflow: "auto",
                                    display: "block",
                                    boxSizing: "border-box",
                                    resize: "none",
                                    p: 1.6,
                                    border: "1px solid var(--field-border)",
                                    borderRadius: "10px",
                                    background: "var(--field-bg)",
                                    color: "var(--fg)",
                                    font: "0.8rem/1.6 ui-monospace, SFMono-Regular, Menlo, monospace",
                                    tabSize: 2,
                                    outline: "none",
                                    "&:focus": { borderColor: ACCENT },
                                }}
                            />
                        </Box>
                    )}
                    <Box
                        onScroll={syncPreviewScroll}
                        sx={{
                            display: contentMode === "html" ? "none" : "block",
                            flex: 1,
                            minHeight: 0,
                            overflowY: "auto",
                            py: { xs: 1.4, md: 1.6 },
                            pr: { xs: 2, md: 3 },
                            pl: { xs: 5, md: 7, lg: 8 },
                        }}
                    >
                        <LixEditor
                            initialContent={initialContent}
                            features={EMAIL_FEATURES}
                            placeholder="Compose your email… type '/' for blocks, {{variables}} for dynamic values"
                            uploadFile={handleUpload}
                            variableSuggestions={variables}
                            buttonDefaults={buttonDefaults}
                            onReady={handleEditorReady}
                            onChange={handleEditorChange}
                        />
                    </Box>
                    {contentMode === "editor" && (
                        <ComposerToolbar
                            getEditor={() => apiRef.current?.getEditor?.() ?? null}
                            uploadImage={handleUpload}
                        />
                    )}
                    <AttachmentsStrip
                        attachments={attachments}
                        onChange={setAttachments}
                        onToast={setToast}
                    />
                </GlassCard>

                {/* RIGHT — inbox preview */}
                <GlassCard
                    sx={{
                        p: 0,
                        overflow: "hidden",
                        flexDirection: "column",
                        flex: 1,
                        minWidth: 0,
                        minHeight: { xs: 480, lg: 0 },
                        display: viewMode === "editor" ? "none" : "flex",
                    }}
                >
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{
                            px: 2,
                            py: 1.3,
                            borderBottom: "1px solid var(--border)",
                            flexWrap: "wrap",
                            gap: 1,
                            flexShrink: 0,
                        }}
                    >
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <VisibilityIcon sx={{ fontSize: 18, color: ACCENT }} />
                            <Typography
                                sx={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--fg)" }}
                            >
                                Inbox preview
                            </Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography
                                sx={{
                                    color: TEXT_60,
                                    fontSize: "0.78rem",
                                    mr: 0.2,
                                    display: { xs: "none", sm: "block" },
                                }}
                            >
                                Background
                            </Typography>
                            {BG_PRESETS.map((c) => (
                                <Box
                                    key={c}
                                    onClick={() => setBgColor(c)}
                                    title={c}
                                    sx={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: "6px",
                                        cursor: "pointer",
                                        background: c,
                                        border:
                                            bgColor.toLowerCase() === c.toLowerCase()
                                                ? `2px solid ${ACCENT}`
                                                : "1px solid var(--border)",
                                    }}
                                />
                            ))}
                            <Box
                                component="label"
                                title="Custom colour"
                                sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 20,
                                    height: 20,
                                    borderRadius: "6px",
                                    overflow: "hidden",
                                    cursor: "pointer",
                                    border: "1px solid var(--border)",
                                    background:
                                        "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
                                }}
                            >
                                <Box
                                    component="input"
                                    type="color"
                                    value={bgColor}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                        setBgColor(e.target.value)
                                    }
                                    sx={{ width: 0, height: 0, opacity: 0, p: 0, m: 0, border: 0 }}
                                />
                            </Box>
                        </Stack>
                    </Stack>
                    {showPreview ? (
                        <Box
                            sx={{
                                flex: 1,
                                minHeight: 0,
                                display: "flex",
                                flexDirection: "column",
                                p: { xs: 1.5, md: 2 },
                            }}
                        >
                            <Box sx={{ mb: 1, px: 0.5, flexShrink: 0 }}>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.72rem",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                    }}
                                >
                                    Subject
                                </Typography>
                                <Typography
                                    sx={{
                                        color: "var(--fg)",
                                        fontSize: "0.92rem",
                                        fontWeight: 600,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {subject.trim() || "(no subject)"}
                                </Typography>
                            </Box>
                            <Box
                                component="iframe"
                                ref={previewRef}
                                title="Email inbox preview"
                                // No allow-scripts: unsaved raw HTML can never run in the
                                // dashboard. allow-same-origin keeps scroll-sync working.
                                sandbox="allow-same-origin"
                                srcDoc={previewHtml}
                                sx={{
                                    flex: 1,
                                    minHeight: 0,
                                    width: "100%",
                                    border: "1px solid var(--border)",
                                    borderRadius: "10px",
                                    background: "#fff",
                                    display: "block",
                                }}
                            />
                        </Box>
                    ) : (
                        <Box sx={{ flex: 1, display: "grid", placeItems: "center" }}>
                            <Typography sx={{ color: TEXT_60, fontSize: "0.85rem" }}>
                                Preview hidden
                            </Typography>
                        </Box>
                    )}
                </GlassCard>
            </Box>

            <Dialog
                open={confirmVisual}
                onClose={() => setConfirmVisual(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle sx={{ fontWeight: 800 }}>Switch to the visual editor?</DialogTitle>
                <DialogContent>
                    <Typography sx={{ fontSize: "0.9rem", color: TEXT_60, lineHeight: 1.6 }}>
                        Your HTML is converted into editor blocks. Text, links, images and{" "}
                        {"{{variables}}"} carry over, but custom styling — tables, inline CSS and
                        &lt;style&gt; rules — is simplified. You can undo this by not saving.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setConfirmVisual(false)} sx={{ ...GHOST_BTN }}>
                        Keep HTML
                    </Button>
                    <Button onClick={switchToVisual} sx={{ ...SAVE_BTN_SX, py: 0.8 }}>
                        Convert
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={2600}
                onClose={() => setToast(null)}
                message={toast || ""}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            />
        </Box>
    );
}

/** Flatten a BlockNote document to its plain text (for the min-length gate). */
function blocksToPlainText(blocks: any[]): string {
    if (!Array.isArray(blocks)) return "";
    let out = "";
    for (const b of blocks) {
        if (Array.isArray(b?.content)) {
            for (const c of b.content) if (typeof c?.text === "string") out += c.text;
        }
        if (Array.isArray(b?.children)) out += ` ${blocksToPlainText(b.children)}`;
        out += " ";
    }
    return out.trim();
}
