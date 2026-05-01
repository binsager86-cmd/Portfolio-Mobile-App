/**
 * Whale Radar AI Chat — Gemini deep-thinking analyst review.
 *
 * Routes through /api/v1/ai/whale-chat which uses gemini-2.5-pro with
 * dynamic thinking budget. The full radar engine result + ticker context
 * is injected into the system prompt and chat history is replayed on
 * each turn so Gemini has the conversation context.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation } from "@tanstack/react-query";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { whaleChat } from "@/services/api/analytics/tracker";
import type { EngineOutput } from "@/src/features/trade-signals/whaleRadar";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  colors: ThemePalette;
  ticker: string;
  result: EngineOutput;
}

function buildSystemContext(ticker: string, r: EngineOutput): string {
  const factors = r.factors.contributions
    .map((c) => `${c.name}: +${c.points.toFixed(1)}/${c.weight}`)
    .join(", ");
  return [
    `You are a senior institutional trading analyst reviewing the Whale Flow Decision Engine output for ${ticker}.`,
    `Engine result:`,
    `  Action: ${r.action}`,
    `  Bias: ${r.bias}`,
    `  Accumulation Score: ${r.accumulation_score}/100`,
    `  Distribution Score: ${r.distribution_score}/100`,
    `  Multi-timeframe Alignment: ${r.alignment}`,
    `  Confidence: ${(r.confidence * 100).toFixed(0)}%`,
    `  Estimated Institutional Flow Range: ${r.estimated_flow_range[0].toFixed(0)} – ${r.estimated_flow_range[1].toFixed(0)}`,
    `  Alert Level: ${r.alert.alert_level}`,
    `  Primary Driver: ${r.alert.primary_driver}`,
    `  Confirmation Signals: ${r.alert.confirmation_signals.join(" | ")}`,
    `  Key Level: ${r.alert.key_level}`,
    `  Invalidation: ${r.alert.invalidation}`,
    `  Suggested Action: ${r.alert.suggested_action}`,
    `  Factor Contributions: ${factors}`,
    `  Data Quality: estimated (EOD A/D multiplier proxy — no tick aggressor data).`,
    ``,
    `You are in deep-thinking mode. Take time to reason carefully before answering.`,
    `For every reply:`,
    `  • Provide a thorough, multi-paragraph analysis (typically 4–8 paragraphs).`,
    `  • Quote the specific engine scores, factors, and thresholds you are reasoning from.`,
    `  • Walk through your logic step by step — don't just state conclusions.`,
    `  • Surface counter-arguments and risks honestly, not just bullish/bearish framing.`,
    `  • End with a clear "Bottom line" paragraph summarizing your view.`,
    `Use Markdown formatting (headings, bold, bullet lists, tables where useful) so the response is easy to scan.`,
    `Do not give absolute investment advice — frame everything as analysis. If the user asks about something unrelated to ${ticker} or this engine output, politely steer them back.`,
  ].join("\n");
}

function buildPrompt(systemCtx: string, history: ChatMessage[], newMsg: string): string {
  const turns = history
    .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
    .join("\n\n");
  return `${systemCtx}\n\n--- CONVERSATION ---\n${turns ? turns + "\n\n" : ""}USER: ${newMsg}\n\nASSISTANT:`;
}

const SUGGESTIONS = [
  "Why is the action what it is?",
  "What's the biggest risk here?",
  "Explain the factor contributions.",
  "What would invalidate this setup?",
];

export function WhaleRadarAIChat({ colors, ticker, result }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const systemCtx = buildSystemContext(ticker, result);

  const chatMutation = useMutation({
    mutationFn: async (userMsg: string) => {
      const prompt = buildPrompt(systemCtx, messages, userMsg);
      const res = await whaleChat(prompt);
      return res.analysis;
    },
    onSuccess: (assistantText) => {
      setMessages((m) => [...m, { role: "assistant", content: assistantText }]);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
  });

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatMutation.isPending) return;
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    chatMutation.mutate(trimmed);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const errorMessage =
    chatMutation.isError && chatMutation.error instanceof Error ? chatMutation.error.message : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={styles.headerRow}>
        <FontAwesome name="comments" size={18} color={colors.accentPrimary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>AI Analyst Review</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Discuss this signal with Gemini — ask follow-up questions
          </Text>
        </View>
      </View>

      {/* Suggested prompts (only shown before first message) */}
      {messages.length === 0 && (
        <View style={styles.suggestRow}>
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => send(s)}
              style={[styles.suggestChip, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}
            >
              <Text style={[styles.suggestText, { color: colors.textSecondary }]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Message list */}
      {messages.length > 0 && (
        <ScrollView
          ref={scrollRef}
          style={[styles.messages, { borderColor: colors.borderColor }]}
          contentContainerStyle={{ padding: 12, gap: 10 }}
        >
          {messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === "user"
                  ? { alignSelf: "flex-end", backgroundColor: colors.accentPrimary }
                  : { alignSelf: "flex-start", backgroundColor: colors.bgSecondary },
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  { color: m.role === "user" ? "#fff" : colors.textPrimary },
                ]}
                selectable
              >
                {m.content}
              </Text>
            </View>
          ))}
          {chatMutation.isPending && (
            <View style={[styles.bubble, { alignSelf: "flex-start", backgroundColor: colors.bgSecondary }]}>
              <ActivityIndicator color={colors.accentPrimary} />
            </View>
          )}
        </ScrollView>
      )}

      {errorMessage && (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + "15", borderColor: colors.danger + "40" }]}>
          <FontAwesome name="exclamation-triangle" size={14} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {errorMessage}. Configure your Gemini API key in Settings.
          </Text>
        </View>
      )}

      {/* Composer */}
      <View style={styles.composerRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask the AI about this signal…"
          placeholderTextColor={colors.textMuted}
          multiline
          editable={!chatMutation.isPending}
          style={[
            styles.composerInput,
            { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.borderColor },
          ]}
          onSubmitEditing={() => send(input)}
        />
        <Pressable
          onPress={() => send(input)}
          disabled={!input.trim() || chatMutation.isPending}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor:
                !input.trim() || chatMutation.isPending ? colors.textMuted : colors.accentPrimary,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          {chatMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <FontAwesome name="send" size={14} color="#fff" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 17, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2 },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  suggestText: { fontSize: 13, fontWeight: "500" },
  messages: { maxHeight: 380, borderWidth: 1, borderRadius: 10 },
  bubble: { maxWidth: "85%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  composerRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1 },
  errorText: { flex: 1, fontSize: 13 },
});
