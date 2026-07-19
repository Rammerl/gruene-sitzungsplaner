"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8..22

type Member = { id: string; name: string };

function slotKey(weekday: number, hour: number) {
  return `${weekday}-${hour}`;
}

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [newMemberName, setNewMemberName] = useState("");
  const [mySlots, setMySlots] = useState<Set<string>>(new Set());
  const [overviewCounts, setOverviewCounts] = useState<Map<string, string[]>>(new Map());
  const [view, setView] = useState<"edit" | "overview">("edit");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMembers();
  }, []);

  useEffect(() => {
    if (selectedMemberId) {
      loadMyAvailability(selectedMemberId);
    } else {
      setMySlots(new Set());
    }
  }, [selectedMemberId]);

  useEffect(() => {
    if (view === "overview") {
      loadOverview();
    }
  }, [view]);

  async function loadMembers() {
    const { data, error } = await supabase.from("members").select("id,name").order("name");
    if (!error && data) setMembers(data);
  }

  async function addMember() {
    const name = newMemberName.trim();
    if (!name) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("members")
      .insert({ name })
      .select("id,name")
      .single();
    setLoading(false);
    if (error) {
      alert("Konnte Person nicht anlegen (Name evtl. schon vergeben).");
      return;
    }
    setNewMemberName("");
    setMembers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedMemberId(data.id);
  }

  async function loadMyAvailability(memberId: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from("availability")
      .select("weekday,hour")
      .eq("member_id", memberId);
    setLoading(false);
    if (!error && data) {
      setMySlots(new Set(data.map((r) => slotKey(r.weekday, r.hour))));
    }
  }

  async function toggleSlot(weekday: number, hour: number) {
    if (!selectedMemberId) return;
    const key = slotKey(weekday, hour);
    const isAvailable = mySlots.has(key);

    const next = new Set(mySlots);
    if (isAvailable) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setMySlots(next);

    if (isAvailable) {
      await supabase
        .from("availability")
        .delete()
        .eq("member_id", selectedMemberId)
        .eq("weekday", weekday)
        .eq("hour", hour);
    } else {
      await supabase.from("availability").upsert({
        member_id: selectedMemberId,
        weekday,
        hour,
        available: true,
      });
    }
  }

  async function loadOverview() {
    setLoading(true);
    const { data, error } = await supabase
      .from("availability")
      .select("weekday,hour,members(name)");
    setLoading(false);
    if (error || !data) return;
    const map = new Map<string, string[]>();
    for (const row of data as any[]) {
      const key = slotKey(row.weekday, row.hour);
      const name = row.members?.name as string | undefined;
      if (!name) continue;
      const list = map.get(key) ?? [];
      list.push(name);
      map.set(key, list);
    }
    setOverviewCounts(map);
  }

  const maxCount = useMemo(() => {
    let max = 0;
    overviewCounts.forEach((names) => {
      if (names.length > max) max = names.length;
    });
    return Math.max(max, 1);
  }, [overviewCounts]);

  function overviewColor(count: number) {
    if (count === 0) return "white";
    const intensity = count / maxCount;
    const green = Math.round(216 - intensity * 100);
    return `rgb(${Math.round(255 - intensity * 90)}, ${255 - Math.round(intensity * 60)}, ${green})`;
  }

  return (
    <div className="container">
      <h1>Sitzungsplaner OV Grüne</h1>
      <p className="subtitle">Trag ein, wann du normalerweise Zeit hast – die Übersicht zeigt, wann die meisten können.</p>

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
          <button onClick={addMember} disabled={loading}>
            Hinzufügen
          </button>
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
        <p className="hint">Bitte oben eine Person auswählen oder anlegen, um Verfügbarkeit einzutragen.</p>
      )}

      <div className="grid-wrapper">
        <table className="grid">
          <thead>
            <tr>
              <th></th>
              {WEEKDAYS.map((day) => (
                <th key={day}>{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((hour) => (
              <tr key={hour}>
                <td className="hour-label">{hour}:00</td>
                {WEEKDAYS.map((_, weekday) => {
                  const key = slotKey(weekday, hour);
                  if (view === "edit") {
                    const isAvailable = mySlots.has(key);
                    return (
                      <td
                        key={key}
                        className={`cell ${isAvailable ? "available" : "unavailable"} ${
                          selectedMemberId ? "" : "readonly"
                        }`}
                        onClick={() => toggleSlot(weekday, hour)}
                        title={isAvailable ? "verfügbar" : "nicht verfügbar"}
                      />
                    );
                  } else {
                    const names = overviewCounts.get(key) ?? [];
                    return (
                      <td
                        key={key}
                        className="cell readonly"
                        style={{ background: overviewColor(names.length) }}
                        title={names.length ? names.join(", ") : "niemand verfügbar"}
                      >
                        {names.length || ""}
                      </td>
                    );
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view === "edit" && (
        <p className="hint">Klick auf ein Feld, um deine übliche Verfügbarkeit an- oder abzuwählen. Änderungen werden sofort gespeichert.</p>
      )}
    </div>
  );
}
