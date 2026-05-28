/**
 * StatementTableRows — EditableCell (memoized) and SortableRow (dnd-kit)
 * sub-components extracted from StatementsTable.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { ThemePalette } from "@/constants/theme";
import { tokens } from "@/theme/tokens";
import { formatLineItemValue } from "../utils";

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
  onStartEdit, onSave, onCancel, cellEditKey, onCreateSave, isDesktop, cellLabel,
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
  isDesktop: boolean;
  cellLabel: string;
}) {
  const actualKey = itemId != null ? String(itemId) : cellEditKey ?? null;
  const isEditing = editingKey != null && actualKey === editingKey;
  const [localValue, setLocalValue] = useState(String(value ?? "0"));
  const cellFontSize = isDesktop ? 14 : 12;
  const inputHeight = isDesktop ? 32 : 26;
  const iconSize = isDesktop ? 13 : 12;

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
        <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.spacing.xs }}>
          <TextInput
            value={localValue}
            onChangeText={setLocalValue}
            keyboardType="numeric"
            autoFocus
            style={{
              width: colWidth - 40, height: inputHeight, borderWidth: 1, borderRadius: 6,
              borderColor: colors.accentPrimary, color: colors.textPrimary,
              backgroundColor: colors.bgCard, fontSize: cellFontSize,
              paddingHorizontal: tokens.spacing.sm, textAlign: "right", fontVariant: ["tabular-nums"],
            }}
            onSubmitEditing={handleSubmit}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Save value" onPress={handleSubmit} hitSlop={tokens.spacing.sm}>
            <FontAwesome name="check" size={iconSize} color={colors.success} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel edit" onPress={onCancel} hitSlop={tokens.spacing.sm}>
            <FontAwesome name="times" size={iconSize} color={colors.textMuted} />
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
          fontSize: cellFontSize, fontWeight: isTotal ? "700" : "500",
          color: value != null && value < 0 ? colors.danger : (isTotal ? colors.textPrimary : colors.textSecondary),
          fontVariant: ["tabular-nums"], textAlign: "right",
        }}>
          {value != null ? formatLineItemValue(cellLabel, value) : "-"}
        </Text>
        {isEdited && (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning, marginLeft: tokens.spacing.xs }} />
        )}
      </Pressable>
    </View>
  );
});

// ── SortableRow ─────────────────────────────────────────────────────

export function SortableRow({
  id, item, rowIdx, periods, colors, COL_NAME_W, COL_VAL_W,
  editingKey, onStartEdit, onSaveEdit, onCancelEdit, onCreateSave, onDeleteRow,
  mergeMode, mergeSelected, onToggleMerge, isDesktop,
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
  isDesktop: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const rowPaddingY = isDesktop ? 11 : 8;
  const rowPaddingX = isDesktop ? 12 : 8;
  const nameFontSize = isDesktop ? 14 : 12;
  const handleFontSize = isDesktop ? 14 : 12;
  const deleteIconSize = isDesktop ? 11 : 10;
  const mergeBoxSize = isDesktop ? 20 : 18;
  const mergeCheckSize = isDesktop ? 11 : 10;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    paddingTop: rowPaddingY,
    paddingBottom: rowPaddingY,
    paddingLeft: rowPaddingX,
    paddingRight: rowPaddingX,
    backgroundColor: isDragging
      ? (colors.accentPrimary + "20")
      : item.isTotal ? (colors.bgInput + "60") : rowIdx % 2 === 0 ? "transparent" : (colors.bgPrimary + "30"),
    borderTopWidth: item.isTotal ? 1 : 0,
    borderTopColor: colors.borderColor,
    borderTopStyle: item.isTotal ? "solid" as const : undefined,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div ref={setNodeRef} style={{
      ...style,
      ...(mergeSelected ? { backgroundColor: colors.accentPrimary + "25", borderLeft: `3px solid ${colors.accentPrimary}` } : {}),
    }}>
      {mergeMode && (
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`Select ${item.name} for merge`} accessibilityState={{ checked: mergeSelected }} onPress={() => onToggleMerge(item.code)} hitSlop={tokens.spacing.xs} style={{ marginRight: tokens.spacing.xs, padding: tokens.spacing.xs }}>
          <View style={{
            width: mergeBoxSize, height: mergeBoxSize, borderRadius: 4, borderWidth: 1.5,
            borderColor: mergeSelected ? colors.accentPrimary : colors.textMuted,
            backgroundColor: mergeSelected ? colors.accentPrimary : "transparent",
            alignItems: "center", justifyContent: "center",
          }}>
            {mergeSelected && <FontAwesome name="check" size={mergeCheckSize} color="#fff" />}
          </View>
        </Pressable>
      )}
      <div
        {...attributes}
        {...listeners}
        style={{ cursor: "grab", padding: tokens.spacing.xs, marginRight: tokens.spacing.xs, display: "flex", alignItems: "center", touchAction: "none" }}
      >
        <Text style={{ fontSize: handleFontSize, color: colors.textMuted }}>⠿</Text>
      </div>
      <Text numberOfLines={1} style={{
        width: COL_NAME_W - 36, fontSize: nameFontSize,
        fontWeight: item.isTotal ? "700" : "400",
        color: item.isTotal ? colors.textPrimary : colors.textSecondary,
      }}>
        {item.name}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Delete row ${item.name}`} onPress={() => onDeleteRow(item.code, item.name)} hitSlop={tokens.spacing.xs} style={{ marginRight: tokens.spacing.xs, padding: tokens.spacing.xs }}>
        <FontAwesome name="trash-o" size={deleteIconSize} color={colors.danger + "80"} />
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
            isDesktop={isDesktop}
            cellLabel={item.name}
            onCreateSave={dashKey ? (amount: number) => onCreateSave(p.statementId, item.code, item.name, rowIdx + 1, amount) : undefined}
          />
        );
      })}
    </div>
  );
}
