/**
 * DateInput — cross-platform calendar picker.
 * Uses a modal month calendar for both web and native.
 */

import React, { useMemo, useState } from "react";
import { View, Pressable, StyleSheet, Text, Modal, TouchableOpacity } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import { useThemeStore } from "@/services/themeStore";

interface DateInputProps {
  value: string;
  onChangeText: (text: string) => void;
  hasError?: boolean;
  compact?: boolean;
  placeholder?: string;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function DateInput({ value, onChangeText, hasError, compact = false, placeholder }: DateInputProps) {
  const { colors } = useThemeStore();
  const [showPicker, setShowPicker] = useState(false);
  const selectedDate = isIsoDate(value) ? value : undefined;
  const today = toIsoDate(new Date());
  const displayValue = value || placeholder || "YYYY-MM-DD";

  const markedDates = useMemo(() => {
    const marks: Record<string, { selected?: boolean; selectedColor?: string; selectedTextColor?: string; marked?: boolean; dotColor?: string }> = {
      [today]: {
        marked: true,
        dotColor: colors.accentPrimary,
      },
    };

    if (selectedDate) {
      marks[selectedDate] = {
        selected: true,
        selectedColor: colors.accentPrimary,
        selectedTextColor: "#FFFFFF",
      };
    }

    return marks;
  }, [selectedDate, today, colors.accentPrimary]);

  return (
    <View style={styles.row}>
      <Pressable
        style={[
          compact ? styles.compactDisplayBox : styles.displayBox,
          {
            backgroundColor: colors.bgInput,
            borderColor: hasError ? colors.danger : colors.borderColor,
          },
        ]}
        onPress={() => setShowPicker(true)}
      >
        <FontAwesome name="calendar" size={compact ? 14 : 16} color={colors.accentPrimary} />
        <Text style={[compact ? styles.compactDisplayText : styles.displayText, { color: value ? colors.textPrimary : colors.textMuted }]}>
          {displayValue}
        </Text>
        {compact ? <FontAwesome name="chevron-down" size={12} color={colors.textMuted} style={styles.compactChevron} /> : null}
      </Pressable>
      {!compact ? (
        <Pressable
          style={[
            styles.iconBox,
            { backgroundColor: colors.bgInput, borderColor: colors.borderColor },
          ]}
          onPress={() => setShowPicker(true)}
        >
          <FontAwesome name="calendar" size={18} color={colors.accentPrimary} />
        </Pressable>
      ) : null}

      <Modal visible={showPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Date</Text>
            <Calendar
              current={selectedDate ?? today}
              markedDates={markedDates}
              onDayPress={(day) => {
                onChangeText(day.dateString);
                setShowPicker(false);
              }}
              theme={{
                backgroundColor: colors.bgCard,
                calendarBackground: colors.bgCard,
                textSectionTitleColor: colors.textSecondary,
                selectedDayBackgroundColor: colors.accentPrimary,
                selectedDayTextColor: "#FFFFFF",
                todayTextColor: colors.accentPrimary,
                dayTextColor: colors.textPrimary,
                textDisabledColor: colors.textMuted,
                monthTextColor: colors.textPrimary,
                arrowColor: colors.accentPrimary,
              }}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => onChangeText(today)} style={[styles.modalBtn, { borderColor: colors.borderColor }]}>
                <Text style={{ color: colors.accentPrimary, fontWeight: "600" }}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowPicker(false)} style={[styles.modalBtn, { borderColor: colors.borderColor }]}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  displayBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  compactDisplayBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  displayText: {
    fontSize: 15,
    fontWeight: "500",
  },
  compactDisplayText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  compactChevron: {
    marginLeft: "auto",
  },
  iconBox: {
    borderWidth: 1,
    borderRadius: 10,
    width: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
});
