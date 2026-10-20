# Vokabeltrainer – Projektregeln

Vollständige Spezifikation: SPEC.md. Reines HTML/CSS/Vanilla-JS-PWA, kein Build-Schritt.

- Bestehende Karten auf dem iPhone müssen bei jedem Update erhalten bleiben. IndexedDB nur über `onupgradeneeded` mit `oldVersion`-Prüfung ändern, nie Stores löschen oder neu anlegen.
- Bei jeder Änderung `CACHE_VERSION` in `sw.js` erhöhen.
- Keine Frameworks, keine API-Schlüssel im Code (Repo ist öffentlich).
- Schlicht bleiben: neue Funktionen nur, wenn ausdrücklich gewünscht.
- Relative Pfade (App läuft unter /vokabeln/). Oberfläche auf Deutsch.
- Test-Werkzeuge (Playwright o.ä.) liegen nicht im Repo.
