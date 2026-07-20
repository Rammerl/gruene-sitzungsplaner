"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const HOUR_PX = 32;
const HEADER_HEIGHT = 28;
const CLICK_THRESHOLD_PX = 6;
const MOBILE_QUERY = "(max-width: 700px)";
const START_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i); // 0..23
const END_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1); // 1..24

type Category = "verfuegbar" | "nach_absprache" | "blockiert";

const CATEGORY_ORDER: Category[] = ["verfuegbar", "nach_absprache", "blockiert"];
const CATEGORY_LABEL: Record<Category, string> = {
  verfuegbar: "Verfügbar",
  nach_absprache: "Nach Absprache",
  blockiert: "Blockiert",
};
const CATEGORY_COLOR: Record<Category, string> = {
  verfuegbar: "#93d5ab",
  nach_absprache: "#f6cf76",
  blockiert: "#f0a0a0",
};

type Member = { id: string; name: string };
type Block = {
  id: string;
  member_id: string;
  weekday: number;
  start_hour: number;
  end_hour: number;
  category: Category;
};
type Draft = { weekday: number; start: number; end: number };

function yToHour(y: number, hoursStart: number, hoursEnd: number) {
  const raw = hoursStart + y / HOUR_PX;
  return Math.min(hoursEnd, Math.max(hoursStart, Math.round(raw)));
}

export default function SurveyView({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [surveyName, setSurveyName] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [hoursStart, setHoursStart] = useState(8);
  const [hoursEnd, setHoursEnd] = useState(23);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsStart, setSettingsStart] = useState(8);
  const [settingsEnd, setSettingsEnd] = useState(23);
  const [savingSettings, setSavingSettings] = useState(false);

  const columnHeight = (hoursEnd - hoursStart) * HOUR_PX;

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [newMemberName, setNewMemberName] = useState("");

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [view, setView] = useState<"edit" | "overview">("edit");
  const [overviewBlocks, setOverviewBlocks] = useState<(Block & { memberName: string })[]>([]);

  const [draft, setDraft] = useState<Draft | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [mobileDayIndex, setMobileDayIndex] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    loadSurvey();
  }, [token]);

  useEffect(() => {
    if (selectedMemberId) {
      loadMyBlocks(selectedMemberId);
    } else {
      setBlocks([]);
    }
  }, [selectedMemberId]);

  useEffect(() => {
    if (view === "overview" && surveyId) {
      loadOverview(surveyId);
    }
  }, [view, surveyId]);

  async function loadSurvey() {
    setLoading(true);
    const { data: survey, error } = await supabase
      .from("surveys")
      .select("id,name,start_hour,end_hour")
      .eq("token", token)
      .maybeSingle();
    if (error || !survey) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setSurveyId(survey.id);
    setSurveyName(survey.name);
    setHoursStart(survey.start_hour);
    setHoursEnd(survey.end_hour);
    setSettingsStart(survey.start_hour);
    setSettingsEnd(survey.end_hour);
    const { data: memberRows } = await supabase
      .from("members")
      .select("id,name")
      .eq("survey_id", survey.id)
      .order("name");
    setMembers(memberRows ?? []);
    setLoading(false);
  }

  async function saveSettings() {
    if (!surveyId || settingsEnd <= settingsStart) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("surveys")
      .update({ start_hour: settingsStart, end_hour: settingsEnd })
      .eq("id", surveyId);
    setSavingSettings(false);
    if (error) {
      alert("Konnte Zeitraum nicht speichern.");
      return;
    }
    setHoursStart(settingsStart);
    setHoursEnd(settingsEnd);
    setShowSettings(false);
  }

  async function addMember() {
    const name = newMemberName.trim();
    if (!name || !surveyId) return;
    const { data, error } = await supabase
      .from("members")
      .insert({ name, survey_id: surveyId })
      .select("id,name")
      .single();
    if (error) {
      alert("Konnte Person nicht anlegen (Name evtl. schon vergeben).");
      return;
    }
    setNewMemberName("");
    setMembers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedMemberId(data.id);
  }

  async function loadMyBlocks(memberId: string) {
    const { data, error } = await supabase.from("availability").select("*").eq("member_id", memberId);
    if (!error && data) setBlocks(data as Block[]);
  }

  async function loadOverview(sId: string) {
    const { data, error } = await supabase
      .from("availability")
      .select("id,member_id,weekday,start_hour,end_hour,category,members!inner(name,survey_id)")
      .eq("members.survey_id", sId);
    if (!error && data) {
      setOverviewBlocks(
        (data as any[]).map((row) => ({
          id: row.id,
          member_id: row.member_id,
          weekday: row.weekday,
          start_hour: row.start_hour,
          end_hour: row.end_hour,
          category: row.category,
          memberName: row.members?.name ?? "?",
        }))
      );
    }
  }

  async function createBlock(weekday: number, start: number, end: number, category: Category) {
    if (!selectedMemberId) return;
    const { data, error } = await supabase
      .from("availability")
      .insert({ member_id: selectedMemberId, weekday, start_hour: start, end_hour: end, category })
      .select()
      .single();
    if (!error && data) setBlocks((prev) => [...prev, data as Block]);
  }

  function updateBlockLocal(id: string, patch: Partial<Block>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function persistBlock(id: string, patch: Partial<Block>) {
    await supabase.from("availability").update(patch).eq("id", id);
  }

  async function deleteBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    await supabase.from("availability").delete().eq("id", id);
  }

  async function cycleCategory(block: Block) {
    const idx = CATEGORY_ORDER.indexOf(block.category);
    const next = CATEGORY_ORDER[(idx + 1) % CATEGORY_ORDER.length];
    updateBlockLocal(block.id, { category: next });
    await persistBlock(block.id, { category: next });
  }

  function handleColumnPointerDown(e: React.PointerEvent<HTMLDivElement>, weekday: number) {
    if (!selectedMemberId) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const anchor = Math.min(yToHour(e.clientY - rect.top, hoursStart, hoursEnd), hoursEnd - 1);
    setDraft({ weekday, start: anchor, end: anchor + 1 });

    function onMove(ev: PointerEvent) {
      const current = yToHour(ev.clientY - rect.top, hoursStart, hoursEnd);
      let start = Math.min(anchor, current);
      let end = Math.max(anchor, current);
      if (end === start) end = start + 1;
      setDraft({ weekday, start, end });
    }

    function finish() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      setDraft((current) => {
        if (current) {
          createBlock(current.weekday, current.start, current.end, "verfuegbar");
        }
        return null;
      });
    }

    function cancel() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      setDraft(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  }

  function handleBlockPointerDown(
    e: React.PointerEvent,
    block: Block,
    mode: "move" | "resize-top" | "resize-bottom"
  ) {
    e.preventDefault();
    e.stopPropagation();
    const anchorY = e.clientY;
    const origStart = block.start_hour;
    const origEnd = block.end_hour;
    const duration = origEnd - origStart;
    let moved = false;

    function onMove(ev: PointerEvent) {
      const deltaPx = ev.clientY - anchorY;
      if (Math.abs(deltaPx) >= CLICK_THRESHOLD_PX) moved = true;
      const deltaHours = Math.round(deltaPx / HOUR_PX);

      if (mode === "move") {
        let newStart = origStart + deltaHours;
        newStart = Math.max(hoursStart, Math.min(hoursEnd - duration, newStart));
        updateBlockLocal(block.id, { start_hour: newStart, end_hour: newStart + duration });
      } else if (mode === "resize-top") {
        let newStart = origStart + deltaHours;
        newStart = Math.max(hoursStart, Math.min(origEnd - 1, newStart));
        updateBlockLocal(block.id, { start_hour: newStart });
      } else if (mode === "resize-bottom") {
        let newEnd = origEnd + deltaHours;
        newEnd = Math.min(hoursEnd, Math.max(origStart + 1, newEnd));
        updateBlockLocal(block.id, { end_hour: newEnd });
      }
    }

    function finish() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (!moved) {
        cycleCategory(block);
      } else {
        setBlocks((prev) => {
          const current = prev.find((b) => b.id === block.id);
          if (current) {
            persistBlock(block.id, { start_hour: current.start_hour, end_hour: current.end_hour });
          }
          return prev;
        });
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  const hourMarks = useMemo(() => {
    const marks = [];
    for (let h = hoursStart; h <= hoursEnd; h++) marks.push(h);
    return marks;
  }, [hoursStart, hoursEnd]);

  const bestInfo = useMemo(() => {
    const total = members.length;
    if (view !== "overview" || total === 0) return { max: 0, ranges: [] as { weekday: number; start: number; end: number }[] };
    const grid: number[][] = WEEKDAYS.map(() => Array(hoursEnd - hoursStart).fill(0));
    const blocked: boolean[][] = WEEKDAYS.map(() => Array(hoursEnd - hoursStart).fill(false));
    overviewBlocks.forEach((b) => {
      for (let h = b.start_hour; h < b.end_hour; h++) {
        if (h < hoursStart || h >= hoursEnd) continue;
        if (b.category === "verfuegbar") grid[b.weekday][h - hoursStart]++;
        if (b.category === "blockiert") blocked[b.weekday][h - hoursStart] = true;
      }
    });
    let max = 0;
    grid.forEach((row, weekday) =>
      row.forEach((c, i) => {
        if (!blocked[weekday][i] && c > max) max = c;
      })
    );
    if (max === 0) return { max: 0, ranges: [] };
    const ranges: { weekday: number; start: number; end: number }[] = [];
    grid.forEach((row, weekday) => {
      let rangeStart: number | null = null;
      for (let i = 0; i < row.length; i++) {
        const h = hoursStart + i;
        if (row[i] === max && !blocked[weekday][i]) {
          if (rangeStart === null) rangeStart = h;
        } else if (rangeStart !== null) {
          ranges.push({ weekday, start: rangeStart, end: h });
          rangeStart = null;
        }
      }
      if (rangeStart !== null) ranges.push({ weekday, start: rangeStart, end: hoursEnd });
    });
    return { max, ranges };
  }, [overviewBlocks, members, view, hoursStart, hoursEnd]);

  function renderDayColumn(weekday: number, showHeader: boolean) {
    const day = WEEKDAYS[weekday];
    return (
      <div key={day} className="day-col-wrap">
        {showHeader && <div className="day-col-header">{day}</div>}
        <div
          className="day-col"
          style={{ height: columnHeight }}
          onPointerDown={(e) => handleColumnPointerDown(e, weekday)}
        >
          {view === "edit" &&
            blocks
              .filter((b) => b.weekday === weekday)
              .map((b) => (
                <div
                  key={b.id}
                  className="block"
                  style={{
                    top: (b.start_hour - hoursStart) * HOUR_PX,
                    height: (b.end_hour - b.start_hour) * HOUR_PX,
                    background: CATEGORY_COLOR[b.category],
                  }}
                  onPointerDown={(e) => handleBlockPointerDown(e, b, "move")}
                >
                  <div className="handle top" onPointerDown={(e) => handleBlockPointerDown(e, b, "resize-top")} />
                  <div className="label">{CATEGORY_LABEL[b.category]}</div>
                  <button
                    className="delete-btn"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteBlock(b.id);
                    }}
                  >
                    ×
                  </button>
                  <div
                    className="handle bottom"
                    onPointerDown={(e) => handleBlockPointerDown(e, b, "resize-bottom")}
                  />
                </div>
              ))}

          {view === "edit" && draft && draft.weekday === weekday && (
            <div
              className="block draft"
              style={{
                top: (draft.start - hoursStart) * HOUR_PX,
                height: (draft.end - draft.start) * HOUR_PX,
                background: CATEGORY_COLOR.verfuegbar,
              }}
            />
          )}

          {view === "overview" &&
            (() => {
              const dayBlocks = overviewBlocks.filter((b) => b.weekday === weekday);
              const cells = [];
              for (let h = hoursStart; h < hoursEnd; h++) {
                const names: Record<Category, string[]> = { verfuegbar: [], nach_absprache: [], blockiert: [] };
                dayBlocks.forEach((b) => {
                  if (b.start_hour <= h && h < b.end_hour) names[b.category].push(b.memberName);
                });
                const total = members.length;
                const availableCount = names.verfuegbar.length;
                let bg = "transparent";
                if (names.blockiert.length > 0) {
                  bg = CATEGORY_COLOR.blockiert;
                } else if (names.nach_absprache.length > 0) {
                  bg = CATEGORY_COLOR.nach_absprache;
                } else if (total > 0 && availableCount === total) {
                  bg = CATEGORY_COLOR.verfuegbar;
                }
                const title =
                  [
                    names.verfuegbar.length ? `Verfügbar: ${names.verfuegbar.join(", ")}` : "",
                    names.nach_absprache.length ? `Nach Absprache: ${names.nach_absprache.join(", ")}` : "",
                    names.blockiert.length ? `Blockiert: ${names.blockiert.join(", ")}` : "",
                  ]
                    .filter(Boolean)
                    .join("\n") || "Keine Einträge";
                cells.push(
                  <div
                    key={h}
                    className="overview-cell"
                    title={title}
                    style={{ top: (h - hoursStart) * HOUR_PX, height: HOUR_PX, background: bg }}
                  >
                    {availableCount > 0 && <span>{availableCount}</span>}
                    {names.nach_absprache.length > 0 && (
                      <span className="tentative-count">+{names.nach_absprache.length}</span>
                    )}
                  </div>
                );
              }
              return cells;
            })()}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container">
        <p>Lade Umfrage...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="container">
        <h1>Umfrage nicht gefunden</h1>
        <p>Der Link ist ungültig oder die Umfrage wurde gelöscht.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>{surveyName}</h1>
          <p className="subtitle">Trag ein, wann du normalerweise Zeit hast – die Übersicht zeigt, wann die Gruppe kann.</p>
        </div>
        <button
          className="settings-toggle"
          onClick={() => {
            setSettingsStart(hoursStart);
            setSettingsEnd(hoursEnd);
            setShowSettings((s) => !s);
          }}
        >
          ⚙ Zeitraum
        </button>
      </div>

      {showSettings && (
        <div className="panel settings-panel">
          <div className="row time-range-row">
            <label className="time-range-label">
              Von
              <select value={settingsStart} onChange={(e) => setSettingsStart(Number(e.target.value))}>
                {START_HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="time-range-label">
              Bis
              <select value={settingsEnd} onChange={(e) => setSettingsEnd(Number(e.target.value))}>
                {END_HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </label>
            <button onClick={saveSettings} disabled={savingSettings || settingsEnd <= settingsStart}>
              Speichern
            </button>
            <button className="secondary" onClick={() => setShowSettings(false)}>
              Abbrechen
            </button>
          </div>
          {settingsEnd <= settingsStart && <p className="hint">"Bis" muss nach "Von" liegen.</p>}
        </div>
      )}

      <div className="panel">
        <div className="row">
          <select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)}>
            <option value="">-- Person wählen --</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Neuer Name"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
          />
          <button onClick={addMember}>Hinzufügen</button>
        </div>
      </div>

      <div className="tabs">
        <button className={view === "edit" ? "active" : ""} onClick={() => setView("edit")}>
          Meine Verfügbarkeit
        </button>
        <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>
          Gruppenübersicht
        </button>
      </div>

      {view === "edit" && !selectedMemberId && (
        <p className="hint">Bitte oben eine Person auswählen oder anlegen, um Zeiten einzutragen.</p>
      )}

      <div className="legend">
        {CATEGORY_ORDER.map((c) => (
          <div className="legend-item" key={c}>
            <span className="legend-swatch" style={{ background: CATEGORY_COLOR[c] }} />
            {CATEGORY_LABEL[c]}
          </div>
        ))}
      </div>

      {view === "overview" && bestInfo.max > 0 && (
        <div className="panel best-panel">
          <strong>
            Beste Termine ({bestInfo.max} von {members.length} verfügbar)
          </strong>
          <ul>
            {bestInfo.ranges.map((r, i) => (
              <li key={i}>
                {WEEKDAYS[r.weekday]}, {r.start}:00–{r.end}:00 Uhr
              </li>
            ))}
          </ul>
        </div>
      )}
      {view === "overview" && bestInfo.max === 0 && (
        <p className="hint">Noch keine Verfügbarkeiten eingetragen.</p>
      )}

      {isMobile && (
        <div className="mobile-day-switcher">
          <button onClick={() => setMobileDayIndex((d) => (d + 6) % 7)}>‹</button>
          <span>{WEEKDAYS[mobileDayIndex]}</span>
          <button onClick={() => setMobileDayIndex((d) => (d + 1) % 7)}>›</button>
        </div>
      )}

      <p className="hint range-caption">
        Zeitraum: {hoursStart}:00 – {hoursEnd}:00 Uhr
      </p>

      <div className="calendar-wrapper">
        <div className="calendar">
          <div className="time-gutter" style={{ height: HEADER_HEIGHT + columnHeight }}>
            <div className="gutter-header-spacer" style={{ height: HEADER_HEIGHT }} />
            <div className="hour-marks" style={{ height: columnHeight }}>
              {hourMarks.map((h) => (
                <div key={h} className="hour-mark" style={{ top: (h - hoursStart) * HOUR_PX }}>
                  {h}:00
                </div>
              ))}
            </div>
          </div>
          <div className={`day-columns${isMobile ? " mobile-single" : ""}`}>
            {isMobile
              ? renderDayColumn(mobileDayIndex, false)
              : WEEKDAYS.map((_, weekday) => renderDayColumn(weekday, true))}
          </div>
        </div>
      </div>

      {view === "edit" && (
        <p className="hint">
          Ziehen erstellt einen neuen Block, Ränder ziehen verändert die Länge, Block ziehen verschiebt ihn. Klick auf
          einen Block schaltet die Kategorie um.
        </p>
      )}
    </div>
  );
}
