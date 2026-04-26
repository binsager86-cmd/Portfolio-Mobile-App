/**
 * StatementTableRows (native variant) — drag-and-drop is web-only because
 * it depends on `@dnd-kit` which renders raw HTML <div> elements that
 * crash React Native ("View config getter callback for component `div`").
 *
 * On native we render a plain <View> row with the same edit/merge/delete
 * affordances but without the drag handle.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { formatNumber } from "../utils";

// ── Types ───────────────────────────────────────────────────────────

export type PeriodInfo = {
  label: string;
  period: string;
  statementId: number;
  items: Record<string, { id: number; amount: number; name: string; isTotal: boolean; edited: boolean }>;
};

// ── EditableCell ────────────────────────────────────────────────────

export const EditableCell = React.memo(function EditableCell({
  itemId, value, isTotal, isEdited, colWidth, colors, editingKey,
  onStartEdit, onSave, onCancel, cellEditKey, onCreateSave,
}: {
  itemId: number | null;
  value: number | undefined | null;
  isTotal: boolean;
  isEdited: boolean;
  colWidth: number;
  colors: ThemePalette;
  editingKey: string | null;
  onStartEdit: (id: string, val: string) => void;
  onSave: (id: number, amount: number) => void;
  onCancel: () => void;
  cellEditKey?: string;
  onCreateSave?: (amount: number) => void;
}) {
  const actualKey = itemId != null ? String(itemId) : cellEditKey ?? null;
  const isEditing = editingKey != null && actualKey === editingKey;
  const [localValue, setLocalValue] = useState(String(value ?? "0"));

  useEffect(() => {
    if (isEditing) setLocalValue(String(value ?? "0"));
  }, [isEditing, value]);

  const handleSubmit = useCallback(() => {
    const num = parseFloat(localValue);
    if (isNaN(num)) return;
    if (itemId != null) {
      onSave(itemId, num);
    } else if (onCreateSave) {
      onCreateSave(num);
    }
  }, [localValue, itemId, onSave, onCreateSave]);

  if (isEditing) {
    return (
      <View style={{ width: colWidth, alignItems: "flex-end", justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <TextInput
            value={localValue}
            onChangeText={setLocalValue}
            keyboardType="numeric"
            autoFocus
            style={{
              width: colWidth - 40, height: 26, borderWidth: 1, borderRadius: 6,
              borderColor: colors.accentPrimary, color: colors.textPrimary,
              backgroundColor: colors.bgCard, fontSize: 11,
              paddingHorizontal: 6, textAlign: "right", fontVariant: ["tabular-nums"],
            }}
            onSubmitEditing={handleSubmit}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Save value" onPress={handleSubmit} hitSlop={6}>
            <FontAwesome name="check" size={12} color={colors.success} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel edit" onPress={onCancel} hitSlop={6}>
            <FontAwesome name="times" size={12} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: colWidth, alignItems: "flex-end", justifyContent: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${value ?? 0}`}
        onPress={() => { if (actualKey) onStartEdit(actualKey, String(value ?? "0")); }}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <Text style={{
          fontSize: 12, fontWeight: isTotal ? "700" : "500",
          color: value != null && value < 0 ? colors.danger : (isTotal ? colors.textPrimary : colors.textSecondary),
          fontVariant: ["tabular-nums"], textAlign: "right",
        }}>
          {value != null ? formatNumber(value) : "-"}
        </Text>
        {isEdited && (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning, marginLeft: 4 }} />
        )}
      </Pressable>
    </View>
  );
});

// ── SortableRow (native: no drag) ───────────────────────────────────

export function SortableRow({
  item, rowIdx, periods, colors, COL_NAME_W, COL_VAL_W,
  editingKey, onStartEdit, onSaveEdit, onCancelEdit, onCreateSave, onDeleteRow,
  mergeMode, mergeSelected, onToggleMerge,
}: {
  id: string;
  item: { code: string; name: string; isTotal: boolean };
  rowIdx: number;
  periods: PeriodInfo[];
  colors: ThemePalette;
  COL_NAME_W: number;
  COL_VAL_W: number;
  editingKey: string | null;
  onStartEdit: (id: string, val: string) => void;
  onSaveEdit: (id: number, amount: number) => void;
  onCancelEdit: () => void;
  onCreateSave: (statementId: number, code: string, name: string, orderIdx: number, amount: number) => void;
  onDeleteRow: (code: string, name: string) => void;
  mergeMode: boolean;
  mergeSelected: boolean;
  onToggleMerge: (code: string) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 8,
        backgroundColor: mergeSelected
          ? (colors.accentPrimary + "25")
          : item.isTotal
          ? (colors.bgInput + "60")
          : rowIdx % 2 === 0
          ? "transparent"
          : (colors.bgPrimary + "30"),
        borderTopWidth: item.isTotal ? 1 : 0,
        borderTopColor: colors.borderColor,
        borderLeftWidth: mergeSelected ? 3 : 0,
        borderLeftColor: mergeSelected ? colors.accentPrimary : "transparent",
      }}
    >
      {mergeMode && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`Select ${item.name} for merge`}
          accessibilityState={{ checked: mergeSelected }}
          onPress={() => onToggleMerge(item.code)}
          hitSlop={4}
          style={{ marginRight: 4, padding: 2 }}
        >
          <View style={{
            width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
            borderColor: mergeSelected ? colors.accentPrimary : colors.textMuted,
            backgroundColor: mergeSelected ? colors.accentPrimary : "transparent",
            alignItems: "center", justifyContent: "center",
          }}>
            {mergeSelected && <FontAwesome name="check" size={10} color="#fff" />}
          </View>
        </Pressable>
      )}
      <Text numberOfLines={1} style={{
        width: COL_NAME_W - 24, fontSize: 12,
        fontWeight: item.isTotal ? "700" : "400",
        color: item.isTotal ? colors.textPrimary : colors.textSecondary,
      }}>
        {item.name}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete row ${item.name}`}
        onPress={() => onDeleteRow(item.code, item.name)}
        hitSlop={4}
        style={{ marginRight: 2, padding: 2 }}
      >
        <FontAwesome name="trash-o" size={10} color={colors.danger + "80"} />
      </Pressable>
      {periods.map((p) => {
        const cell = p.items[item.code];
        const dashKey = cell?.id == null ? `create_${p.statementId}_${item.code}` : undefined;
        return (
          <EditableCell
            key={p.period}
            itemId={cell?.id ?? null}
            value={cell?.amount}
            isTotal={item.isTotal}
            isEdited={!!cell?.edited}
            colWidth={COL_VAL_W}
            colors={colors}
            editingKey={editingKey}
            onStartEdit={onStartEdit}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            cellEditKey={dashKey}
            onCreateSave={dashKey ? (amount: number) => onCreateSave(p.statementId, item.code, item.name, rowIdx + 1, amount) : undefined}
          />
        );
      })}
    </View>
  );
}
