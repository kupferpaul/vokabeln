# Vokabeltrainer Deutsch/Spanisch (PWA)

## Ziel
Eine sehr schlichte Web-App nur für mich auf dem iPhone. Ich schlage ein Wort nach, speichere es als Karteikarte (eine Seite Deutsch, eine Seite Spanisch) und übe später nur meine gespeicherten Karten, auch offline.

## Vorgehen
1. Lies diese Spezifikation komplett. Stell Rückfragen nur bei echten Unklarheiten, nicht zu Dingen, die hier schon entschieden sind.
2. Erstelle einen kurzen Plan (Dateien, Datenmodell, Ablauf) und warte auf mein OK.
3. Speichere diese Spezifikation als SPEC.md. Lege eine kurze CLAUDE.md mit den Projektregeln (siehe unten) an.
4. Baue die App in kleinen Schritten. Committe mit git nach jedem funktionierenden Schritt.
5. Prüfe jedes Abnahmekriterium selbst im Browser mit iPhone-Viewport, auch offline. Für Tests darfst du Werkzeuge wie Playwright nutzen, die nicht Teil der App werden. Zeig mir Belege (Screenshots, Testausgaben). Behaupte keinen Erfolg ohne Beleg.
6. Erst wenn lokal alles läuft: Veröffentlichung über GitHub Pages (siehe Hosting).

## Technik
- Nur HTML, CSS, Vanilla JavaScript. Kein Framework, keine Laufzeit-Abhängigkeiten, kein Build-Schritt, kein Backend.
- Dateien: index.html, style.css, app.js, sw.js, manifest.json, icons/.
- PWA mit iOS-Meta-Tags (apple-touch-icon, Vollbild, Safe Area). Installation über Safari "Zum Home-Bildschirm".
- Relative Pfade, weil die App unter einem Unterpfad läuft (benutzername.github.io/vokabeln/).
- Daten in IndexedDB, navigator.storage.persist() anfragen.
- Datenmodell pro Karte: id, de, es, createdAt. Datenbank mit Versionsnummer, damit spätere Änderungen bestehende Karten nie löschen.
- Service Worker cacht alle App-Dateien. Cache-Version als Konstante, bei jeder Änderung erhöhen.
- Mobile first, große Touch-Flächen, Dark Mode nach Systemeinstellung, Oberfläche auf Deutsch.

## Funktionen

### Suchen
- Suchfeld plus Umschalter DE→ES / ES→DE, der sich die letzte Wahl merkt. Das Suchwort landet auf der Seite der gewählten Ausgangssprache.
- Übersetzung über eine kostenlose API ohne Schlüssel (z.B. MyMemory, prüfe die aktuelle Doku). Wenn die API Alternativen liefert, bis zu 3 als antippbare Vorschläge zeigen.
- Vor dem Speichern sind beide Seiten frei editierbar: Übersetzung kürzen, ändern oder komplett selbst eintragen (z.B. Slang).
- Findet die API nichts oder bin ich offline, bleibt das Feld leer und ich trage selbst ein. Offline kurzer Hinweis, dass Übersetzen Internet braucht.
- "Speichern" nur, wenn beide Seiten ausgefüllt sind. Leerzeichen am Rand entfernen.
- Duplikat = gleiches Paar Deutsch und Spanisch, Groß-/Kleinschreibung egal. Dann nicht speichern, kurzer Hinweis.

### Üben
- Nur gespeicherte Karten, zufällige Reihenfolge, nach der letzten Karte neu mischen.
- Vorderseite pro Karte zufällig Deutsch oder Spanisch.
- Tippen dreht die Karte um. Button "Weiter".
- Button "Aus Stapel entfernen" löscht die Karte, "Rückgängig" etwa 5 Sekunden lang.
- Anzeige der Kartenzahl. Leerer Stapel: kurzer Hinweis statt Fehler.

### Backup (kleines Menü)
- "Exportieren": JSON-Datei mit Datum im Namen. Auf dem iPhone über das Teilen-Menü (Web Share API mit Datei), damit ich "In Dateien sichern" wählen kann. Fallback: normaler Download.
- "Importieren": Dateiauswahl (.json). Karten werden ergänzt, nicht ersetzt, Duplikate übersprungen. Danach anzeigen, wie viele neu dazugekommen sind.

## Nicht im Umfang (bewusst weglassen)
- Login, Konten, Synchronisierung zwischen Geräten
- Bewertung, Statistik, Wiederholungslogik
- Kartenliste, Bearbeiten gespeicherter Karten, Kategorien, Audio
- Bezahlte APIs, API-Schlüssel im Code (das Repo ist öffentlich)

## Abnahmekriterien
1. Ich gebe "Haus" mit DE→ES ein, sehe einen Vorschlag wie "casa", tippe Speichern: Kartenzahl steigt um 1.
2. Dasselbe Paar nochmal speichern: keine zweite Karte, Hinweis erscheint.
3. Ein Wort, für das die API nichts findet: Ich trage die Übersetzung selbst ein und speichere erfolgreich.
4. Ohne Internet: Üben funktioniert, eigene Karten speichern funktioniert, Übersetzen zeigt einen Hinweis.
5. Üben zeigt Karten zufällig, Vorderseite mal Deutsch, mal Spanisch. Tippen dreht um.
6. "Aus Stapel entfernen" löscht die Karte, "Rückgängig" holt sie zurück.
7. Export erzeugt eine JSON-Datei. Nach Löschen aller Daten stellt Import alle Karten wieder her, ohne Duplikate.
8. Nach Neuladen und nach einem Update mit neuer Cache-Version sind alle Karten noch da.
9. Leerer Stapel: Üben zeigt einen Hinweis statt eines Fehlers.

## Hosting
- Ich habe einen neuen GitHub-Account, sonst ist nichts eingerichtet. Prüfe, ob git und die GitHub CLI (gh) installiert sind. Führe mich Schritt für Schritt durch Installation und Login. Markiere klar, was ich selbst tun muss.
- Öffentliches Repo "vokabeln", Veröffentlichung über GitHub Pages.
- Zum Schluss: Link zur App und eine kurze Anleitung, wie ich sie auf dem iPhone installiere und wie Updates ankommen.

## Projektregeln (für CLAUDE.md)
- Bestehende Karten auf dem iPhone müssen bei jedem Update erhalten bleiben.
- Bei jeder Änderung die Cache-Version im Service Worker erhöhen.
- Keine Frameworks, keine API-Schlüssel im Code.
- Schlicht bleiben: neue Funktionen nur, wenn ich sie ausdrücklich will.
