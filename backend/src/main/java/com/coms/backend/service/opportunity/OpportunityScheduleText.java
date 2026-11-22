package com.coms.backend.service.opportunity;

import org.jsoup.nodes.Element;
import org.jsoup.nodes.TextNode;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.MatchResult;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Extracts only explicitly labeled dates from public notices. */
final class OpportunityScheduleText {
    private static final Pattern APPLICATION = Pattern.compile(
            "((?:모집|접수|신청|지원)\\s*(?:기간|일정|시작|마감)|registration\\s+(?:period|deadline))\\s*[:：]?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern EVENT = Pattern.compile(
            "((?:행사|대회|교육|운영|진행|개최)\\s*(?:기간|일정|일시))\\s*[:：]?");

    private static final Pattern RANGE = Pattern.compile("\\s*[~∼～–—]\\s*|\\s+-\\s+");
    private static final String DATE_LITERAL =
            "(?:['’]?(?<year>20[0-9]{2}|[0-9]{2})\\s*(?:년\\s*|[./-]\\s*))?"
            + "(?<month>[0-9]{1,2})\\s*(?:월\\s*|[./-]\\s*)"
            + "(?<day>[0-9]{1,2})(?:\\s*일|\\.)?"
            + "\\s*(?:\\([월화수목금토일](?:요일)?\\))?";
    private static final Pattern DATE = Pattern.compile("^" + DATE_LITERAL
            + "(?:\\s*,?\\s*(?<ampm>오전|오후)?\\s*(?<hour>[0-9]{1,2})(?::(?<minute>[0-9]{2})(?::[0-9]{2})?"
            + "|시(?:\\s*(?<krminute>[0-9]{1,2})분)?))?(?![0-9])");
    // A model may see date literals and grammar markers from schedule rows, but no titles, prose,
    // names, URLs, email addresses, phone numbers, or other text from a source document.
    private static final Pattern SAFE_TOKEN = Pattern.compile(
            "(?<![0-9A-Za-z@._+-])" + DATE_LITERAL + "(?![0-9A-Za-z@._+-])"
            + "|(?<![0-9])(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?![0-9])"
            + "|(?<![0-9])(?:[01]?[0-9]|2[0-3])\\s*시(?:\\s*[0-5]?[0-9]\\s*분)?"
            + "|오전|오후|부터|까지|[~∼～–—]");
    private static final Pattern PHONE_OR_ID = Pattern.compile(
            "(?:[+]?82[ .-]?)?0[1-9][0-9]?[ .-]?[0-9]{3,4}[ .-]?[0-9]{4}|[0-9]{6}[ -][1-8][0-9]{6}");
    private static final int MAX_FRAGMENT_LENGTH = 150;

    private OpportunityScheduleText() {}

    record Dates(String start, String end) {}
    private record ParsedDate(LocalDate date, LocalTime time, boolean statedYear) {
        String value() {
            return time == null ? date.toString() : date.atTime(time).toString();
        }
    }

    static Dates parseRange(String text, Integer referenceYear) {
        String[] parts = RANGE.split(normalizeSpaces(text).strip(), 2);
        if (parts.length < 2) {
            return new Dates(null, null);
        }
        ParsedDate start = parseDate(parts[0], referenceYear);
        ParsedDate end = parseDate(parts[1], start == null ? referenceYear : start.date().getYear());
        if (start == null || end == null) {
            return new Dates(start == null ? null : start.value(), end == null ? null : end.value());
        }
        if (end.date().isBefore(start.date())) {
            if (!end.statedYear() && start.date().getMonthValue() == 12 && end.date().getMonthValue() == 1) {
                end = new ParsedDate(end.date().plusYears(1), end.time(), false);
            } else {
                return new Dates(null, null);
            }
        }
        return new Dates(start.value(), end.value());
    }

    static Dates applicationDates(List<String> lines, Integer referenceYear) {
        Dates partial = new Dates(null, null);
        for (ApplicationLine line : applicationLines(lines)) {
            Dates candidate = parseRange(line.value(), referenceYear);
            if (candidate.start() != null && candidate.end() != null) {
                return candidate;
            }
            if (candidate.end() != null) {
                partial = candidate;
            } else if (line.deadline()) {
                ParsedDate deadline = parseDate(line.value(), referenceYear);
                if (deadline != null) {
                    partial = new Dates(partial.start(), deadline.value());
                }
            } else if (candidate.start() != null) {
                partial = candidate;
            }
        }
        return partial;
    }

    static Dates eventDates(List<String> lines, Integer referenceYear) {
        for (String line : labeledValues(lines, EVENT)) {
            Dates range = parseRange(line, referenceYear);
            if (range.start() != null) {
                return range;
            }
            ParsedDate day = parseDate(line, referenceYear);
            if (day != null) {
                return new Dates(day.value(), null);
            }
        }
        return new Dates(null, null);
    }

    static String applicationSnippet(List<String> lines, Integer referenceYear) {
        if (referenceYear == null) {
            return null;
        }
        List<String> snippets = new ArrayList<>();
        for (ApplicationLine line : applicationLines(lines)) {
            // Do not try to salvage any portion of text that contains contact data.
            if (line.value().contains("@") || line.value().contains("://")
                    || PHONE_OR_ID.matcher(line.value()).find()) {
                continue;
            }
            List<String> tokens = SAFE_TOKEN.matcher(line.value()).results().map(MatchResult::group).toList();
            if (!tokens.isEmpty()) {
                snippets.add((line.deadline() ? "접수 마감: " : "접수 기간: ") + String.join(" ", tokens));
            }
            if (snippets.size() == 3) {
                break;
            }
        }
        return snippets.isEmpty() ? null : "공고 기준 연도: " + referenceYear + "\n" + String.join("\n", snippets);
    }

    static List<String> lines(Element content) {
        if (content == null) {
            return List.of();
        }
        // Preserve word-processor paragraph and line breaks without collecting nested duplicates.
        Element clone = content.clone();
        clone.select("script,style,noscript,iframe,img").remove();
        for (Element block : clone.select("p,li,div,tr,dt,dd,h2,h3,h4,h5,br")) {
            if (block != clone) {
                block.before(new TextNode("\n"));
                block.after(new TextNode("\n"));
            }
        }
        return normalizeSpaces(clone.wholeText()).lines().map(String::strip).filter(line -> !line.isEmpty()).limit(400).toList();
    }

    static boolean looksLikeContact(String value) {
        return value.contains("@") || PHONE_OR_ID.matcher(value).find();
    }

    private static String normalizeSpaces(String text) {
        return text.replace('\u00a0', ' ').replace('\u202f', ' ').replace('\u2007', ' ');
    }

    private record ApplicationLine(String value, boolean deadline) {}

    private static List<ApplicationLine> applicationLines(List<String> lines) {
        List<ApplicationLine> result = new ArrayList<>();
        for (int idx = 0; idx < lines.size() && result.size() < 8; idx++) {
            Matcher label = APPLICATION.matcher(lines.get(idx));
            if (label.find()) {
                String value = followingValue(lines, idx, label.end());
                if (!value.isEmpty()) {
                    result.add(new ApplicationLine(value,
                            label.group(1).contains("마감") || label.group(1).toLowerCase(Locale.ROOT).contains("deadline")));
                }
            }
        }
        return result;
    }

    private static List<String> labeledValues(List<String> lines, Pattern pattern) {
        List<String> values = new ArrayList<>();
        for (int idx = 0; idx < lines.size() && values.size() < 8; idx++) {
            Matcher label = pattern.matcher(lines.get(idx));
            if (label.find()) {
                String value = followingValue(lines, idx, label.end());
                if (!value.isEmpty()) {
                    values.add(value);
                }
            }
        }
        return values;
    }

    private static String followingValue(List<String> lines, int index, int labelEnd) {
        String value = lines.get(index).substring(labelEnd).strip();
        if (value.isEmpty() && index + 1 < lines.size()) {
            value = lines.get(index + 1).strip();
        }
        return value.substring(0, Math.min(value.length(), MAX_FRAGMENT_LENGTH));
    }

    private static ParsedDate parseDate(String text, Integer referenceYear) {
        Matcher match = DATE.matcher(text.strip());
        if (!match.find()) {
            return null;
        }
        String yearText = match.group("year");
        if (yearText == null && referenceYear == null) {
            return null;
        }
        int year = yearText == null ? referenceYear : Integer.parseInt(yearText);
        if (year < 100) {
            year += 2000;
        }
        try {
            LocalDate date = LocalDate.of(year, Integer.parseInt(match.group("month")), Integer.parseInt(match.group("day")));
            if (match.group("hour") == null) {
                return new ParsedDate(date, null, yearText != null);
            }
            int hour = Integer.parseInt(match.group("hour"));
            String minute = match.group("minute") == null ? match.group("krminute") : match.group("minute");
            String ampm = match.group("ampm");
            if (ampm != null) {
                if (hour < 1 || hour > 12) {
                    return null;
                }
                hour = hour % 12 + (ampm.equals("오후") ? 12 : 0);
            }
            return new ParsedDate(date, LocalTime.of(hour, minute == null ? 0 : Integer.parseInt(minute)), yearText != null);
        } catch (DateTimeException invalidDate) {
            return null;
        }
    }
}
