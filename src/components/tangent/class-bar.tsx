import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { clearPages } from "@/lib/tangent/idb";
import type { FlagId } from "@/lib/tangent/types";
import { useTangent } from "@/lib/tangent/store";

export function ClassFlags({ children }: { children: ReactNode }) {
  const classes = useTangent((state) => state.classes);
  const activeClassId = useTangent((state) => state.activeClassId);
  const createClass = useTangent((state) => state.createClass);
  const selectClass = useTangent((state) => state.selectClass);
  const renameClass = useTangent((state) => state.renameClass);
  const deleteClass = useTangent((state) => state.deleteClass);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const course = classes.find((item) => item.id === activeClassId) ?? classes[0];

  function flags() {
    return (
      <>
        {classes.map((item) => {
          const active = item.id === course?.id;
          return (
            <div key={item.id} className={`flag ${active ? "is-active" : ""}`}>
              {editingId === item.id ? (
                <FlagRename
                  value={item.name}
                  onSave={(name) => {
                    renameClass(item.id, name);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <button
                  type="button"
                  className="flag-tip"
                  onClick={() => {
                    if (active) setEditingId(item.id);
                    else selectClass(item.id);
                  }}
                >
                  {active ? <img src="/brand/segment.png" alt="" className="flag-mark" /> : null}
                  <span>{item.name}</span>
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className="flag flag-add" onClick={() => createClass()}>
          <span className="flag-tip">
            <Plus className="mr-1 size-4" aria-hidden />
            Class
          </span>
          <span className="flag-stem" aria-hidden />
        </button>
        {course ? (
          <button type="button" className="flag-delete" aria-label={`Delete ${course.name}`} onClick={() => setPendingDelete(true)}>
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div className="scene">
      <div className="flags-row">{flags()}</div>
      <div className="book-slot">
        <div className="flags-rail">{flags()}</div>
        {children}
      </div>
      {pendingDelete && course ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="delete-class-title">
          <div className="sheet-card">
            <h2 id="delete-class-title">Delete {course.name}?</h2>
            <p className="mt-2">
              Slides, notes, and the saved PDF for this class will be removed. Tangent opens the next class, or a fresh one.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="stamp" onClick={() => setPendingDelete(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="stamp stamp-navy"
                onClick={() => {
                  const removed = deleteClass(course.id);
                  setPendingDelete(false);
                  void Promise.all(removed.map((id) => clearPages(id)));
                }}
              >
                Delete class
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FlagRename({ value, onSave, onCancel }: { value: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      aria-label={`Rename ${value}`}
      className="flag-tip"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onSave(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSave(draft);
        if (event.key === "Escape") onCancel();
      }}
    />
  );
}

export function InlineName({
  value,
  onSave,
  label,
  className = "",
}: {
  value: string;
  onSave: (name: string) => void;
  label: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={label}
        className={className}
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setEditing(true);
          }
        }}
      >
        {value}
      </span>
    );
  }

  return (
    <input
      ref={ref}
      aria-label={label}
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        onSave(draft);
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onSave(draft);
          setEditing(false);
        }
        if (event.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={`tape-input ${className}`}
    />
  );
}

export type { FlagId };
