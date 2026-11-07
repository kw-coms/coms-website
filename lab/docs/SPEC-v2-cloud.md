# Next phase — separate PR

Status: **next phase, separate PR**. Backend + DB schema = **sensitive path**; needs **two cross-model reviews**.

The following section is preserved verbatim from SPEC-v2; it is outside this release.

## 4. Beyond Tinkercad (our additions)
- Club cloud: save circuits to the member's account, list "내 회로", share with the club gallery (공개/비공개), fork others' circuits. (Backend: Spring + Flyway table; sensitive → two cross-model reviews.)
- Missions: guided tasks aligned with the 아두이노 기초 study (e.g. 신호등, 버튼 카운터, 거리 경보기) with automatic checking by running the circuit headlessly and asserting behaviour.
- Logic analyzer instrument; auto-generated 2D schematic view; Korean part info popups (what it is, pins, typical wiring, common mistakes); .ino export and BOM CSV; sticky notes.
- Readability: default camera framing so parts are big enough to grab; magnetic pin snapping feedback; part labels toggle.
