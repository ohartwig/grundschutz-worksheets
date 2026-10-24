# Review: NIS2 Art. 21(2) (§ 30 Abs. 2 BSIG) to Grundschutz++

Version 0.2.1 · status draft · catalog Grundschutz++-resolved_catalog.json at 160c177

Source: Directive (EU) 2022/2555 (NIS2), Art. 21(2); § 30 Abs. 2 BSIG (standards/nis2.json). Check every section against the original text, not against the remark.
Derived targets come from the BSI's own mapping and are only as right as the step to it; a direct target is this repository's judgement.

## Art.21.2.a

Text: Konzepte in Bezug auf die Risikoanalyse und Sicherheit für Informationssysteme;

> Policies on risk analysis and information system security (§ 30 Abs. 2 Nr. 1). Annex A has the policies; risk analysis itself is ISO clause 6.1, not Annex A, so the risk-management requirements are direct targets.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.1, 5.2, 5.4 -- these and no others
  - derived, intersects-with: GC.9.1 Festlegung einer Sicherheitsorganisation; SENS.11.1 Sensibilisierung der Institutionsleitung; SENS.11.2 Führen als Vorbild
- [ ] Direct targets, intersects-with: GC.12.1 Methodik für das Risikomanagement; RISK.1.1 Methodik für das Risikomanagement; RISK.1.3 Risikoeigentümer; RISK.1.5 Freigabe des Risikomanagements; STM.4.1 Durchführung der Risikobetrachtung
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.21.2.b

Text: Bewältigung von Sicherheitsvorfällen;

> Incident handling (Nr. 2).

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.24, 5.25, 5.26, 5.27, 5.28, 6.8 -- these and no others
  - derived, intersects-with: DET.6.1 Beurteilung von Ereignissen; REA.1.1 Verfahren und Regelungen; REA.1.3 Übungen zur Vorfallsbehandlung; REA.2.2 Automatische Erstreaktion; REA.2.5 IT-Forensik; REA.2.5.1 Rechtssichere Beweissicherung; REA.2.5.2 Vier-Augen-Prinzip; REA.2.6 Ursachenanalyse und Behandlung; REA.3.1 Verbesserung durch Erkenntnisse; SENS.2.8 Melden von Ereignissen
- [ ] Direct targets, intersects-with: DET.2.1 Meldeverfahren; REA.2.1 Triage und Erstreaktion
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.21.2.c

Text: Aufrechterhaltung des Betriebs, wie Backup-Management und Wiederherstellung nach einem Notfall, und Krisenmanagement;

> Business continuity, backup management, disaster recovery and crisis management (Nr. 3).

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.29, 5.30, 8.13, 8.14 -- these and no others
  - derived, intersects-with: ARCH.8.1 Redundanz im Kernnetz; ARCH.8.2 Redundante TK-Anbindung; ARCH.8.3 Redundante Server; GEB.9.1.3 Redundante Stromversorgung; GEB.10.1.3 Redundante Klimatisierung; NOT.1.1.4 Business Continuity Management System; NOT.3.1 Wiederanlaufplan; NOT.3.2 Geschäftsfortführungsplan; NOT.3.6 Sicherheitsmechanismen; NOT.4.2 Sicherung des Systems; NOT.4.3 Sicherung der Anwendung; NOT.4.4 Automatische Datensicherung; NOT.4.6 Geschützte Aufbewahrung; NOT.4.7 Versionierte Datensicherung; NOT.4.8 Verschlüsselte Datensicherung; NOT.4.10 Getrennte Aufbewahrung; NOT.4.14 Offline-Kopie; NOT.4.15 Vorgehen zur Wiederherstellung; NOT.4.16 Test der Datensicherung
- [ ] Direct targets, intersects-with: NOT.2.1 Verfahren und Regelungen zur BAO
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.21.2.d

Text: Sicherheit der Lieferkette einschließlich sicherheitsbezogener Aspekte der Beziehungen zwischen den einzelnen Einrichtungen und ihren unmittelbaren Anbietern oder Diensteanbietern;

> Supply chain security, including the relationship with direct suppliers and service providers (Nr. 4).

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.19, 5.20, 5.21, 5.22, 5.23 -- these and no others
  - derived, intersects-with: BES.1.3 Lieferanten- und Dienstleisterverzeichnis; BES.1.3.1 Gesamte Lieferkette; BES.1.4 Outsourcing-Strategie; BES.1.7 Vereinbarung der geteilten Verantwortung; BES.2.2 Dokumentation des Rechtsraums und der Datenlokation; BES.2.3 Vereinbarung des Rechtsraums und der Datenlokation; BES.3.1 Klassifizierung von Lieferantenbeziehungen; BES.4.4 Vertragsvorlage für Outsourcing; BES.4.5 Security by Design; BES.4.5.1 Entwicklung nach einem Sicherheitslebenszyklus; BES.4.8 Konformitätsnachweise; BES.5.2 Service Level Agreement; BES.5.3 Compliance-Verpflichtungen; BES.5.4 Informationssicherheitskontrollmechanismen; BES.5.5.1 Datenlokationen; BES.5.6.3 Nachverfolgbarkeit der Lieferkette; BES.5.9 Umgang mit Änderungen; BES.5.11 Recht auf Audit; BES.5.12 Informationspflichten; BES.6.3 Übertragbarkeit von Daten; BES.7.4.4.1 Software Bill of Materials (SBOM); BES.7.4.12 Software Bill of Materials (SBOM) - Cloud; DLS.3.1 Einhaltung der Sicherheitsvorgaben; DLS.3.2 Checkup; DLS.3.6 Portabilität; DLS.4.1 Dekomissionierung
- [ ] The remark is our own wording, not the source's text

## Art.21.2.e

Text: Sicherheitsmaßnahmen bei Erwerb, Entwicklung und Wartung von Netz- und Informationssystemen, einschließlich Management und Offenlegung von Schwachstellen;

> Security in acquisition, development and maintenance, including vulnerability handling and disclosure (Nr. 5). Disclosure is the intake of external reports, which Annex A does not name.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 8.8, 8.25, 8.26, 8.27, 8.28, 8.29, 8.30, 8.31, 8.32 -- these and no others
  - derived, intersects-with: ARCH.2.2.8 Segmentierung von Test und Betrieb; ARCH.7.3 Entwicklungs- und Testumgebungen; BES.2.1 Erfassung des Bedarfes; BES.4.1 Klassifizierung von Beschaffungsvorhaben; BES.4.2 Dokumentation der Beschaffungskriterien; BES.4.3 Beschaffung anhand der Kriterien; BES.4.4 Vertragsvorlage für Outsourcing; BES.4.5 Security by Design; BES.4.5.1 Entwicklung nach einem Sicherheitslebenszyklus; BES.4.6 Security by Default; BES.5.6 Vergabe von Unteraufträgen; BES.5.11 Recht auf Audit; DET.5.2 Schwachstellenregister; DET.5.3 Schwachstellenscans; DET.5.4 Regelmäßige Penetrationstests; DET.5.10 Zeitnahes Patchmanagement; DEV.1.1 Verfahren und Regelungen; DEV.2.1 Security by Design Architektur; DEV.2.2 Dokumentation der (Software-)Architektur; DEV.2.6 Widerstandsfähigkeit gegen gängige Angriffsmuster; DEV.2.6.1 Eingabevalidierung; DEV.2.6.2 Ausgabekodierung; DEV.3.2 Routinen zur Fehlerbehandlung; DEV.3.3 Deaktivierung der Ausgabe schützenswerter Daten durch Fehlermeldungen; DEV.3.4 Passwort-Hashing; DEV.4.11 Test bei Änderungen am Quellcode; DEV.6.1 Freigabe nach Änderungen und Tests; KONF.6.1.3 Isolierte Arbeitsumgebungen; TEST.1.1 Verfahren und Regelungen; TEST.1.3 Einschränkung von Änderungen; TEST.2.1 Versionshistorie; TEST.2.2 Folgenabschätzung; TEST.3.1 Sicherheitstest; TEST.3.1.1 Dokumentation von Testergebnissen; TEST.3.1.4 Testdaten; TEST.3.1.5 Testumgebung; TEST.3.1.10 Lasttest; TEST.4.1 Autorisierung von Änderungen; TEST.4.3 Rückfallösung; TEST.4.4 Geregelte Notfalländerungen; TEST.5.5 Rückblick
- [ ] Direct targets, intersects-with: DET.5.1 Zeitnahes Schwachstellenmanagement; DET.5.9 Externe Schwachstellenmeldungen; BES.5.10.3 Schwachstellenbehebung
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.21.2.f

Text: Konzepte und Verfahren zur Bewertung der Wirksamkeit von Risikomanagementmaßnahmen im Bereich der Cybersicherheit;

> Policies and procedures to assess the effectiveness of the measures (Nr. 6). Annex A has the independent and compliance reviews; ISO clause 9 is the rest.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.35, 5.36 -- these and no others
  - derived, intersects-with: PERF.2.1 Überprüfung der Einhaltung von Verpflichtungen; PERF.3.1.1 Erstellen eines Auditsplans; PERF.3.1.3 Auswahl des Auditteams
- [ ] Direct targets, intersects-with: PERF.4.1 Eignungsprüfung; VRB.6.1 Überprüfung der erreichten Verbesserung
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.21.2.g

Text: grundlegende Verfahren im Bereich der Cyberhygiene und Schulungen im Bereich der Cybersicherheit;

> Basic cyber hygiene practices and cybersecurity training (Nr. 7). Hygiene is not defined in the directive; taken here as awareness, malware protection, configuration and patching.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 6.3, 8.7, 8.8, 8.9, 8.19 -- these and no others
  - derived, intersects-with: BES.5.7 Schulung; DET.5.1 Zeitnahes Schwachstellenmanagement; DET.5.2 Schwachstellenregister; DET.5.3 Schwachstellenscans; DET.5.4 Regelmäßige Penetrationstests; DET.5.9 Externe Schwachstellenmeldungen; DET.5.10 Zeitnahes Patchmanagement; DET.5.10.1 Autorisierte Bezugsquellen; KONF.2.1 Grundkonfiguration für Systeme; KONF.2.1.1 Versionierung der Systemkonfiguration; KONF.2.5 Überprüfung der Konfiguration; KONF.7.1 Echtzeitscanner; KONF.7.2 Regelmäßige Scans; KONF.7.3 Host-basierte Angriffserkennung; KONF.7.4 Angriffserkennung anhand von Netzverkehr; KONF.7.6 Automatische Updates; KONF.7.9 Einschränkung der Installation; KONF.7.10 Einschränkung der Ausführung; KONF.10.1 Grundkonfiguration für Anwendungen; KONF.10.5 Überprüfung der Konfiguration; PERS.4.1 Qualifikationsbedarf; PERS.4.2 Rollenspezifische Schulungen und Sensibilisierungen; SENS.3.1 Schadprogramme
- [ ] Direct targets, intersects-with: SENS.1.1 Verfahren und Regelungen
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.21.2.h

Text: Konzepte und Verfahren für den Einsatz von Kryptografie und gegebenenfalls Verschlüsselung;

> Policies and procedures regarding the use of cryptography and, where appropriate, encryption (Nr. 8).

- [ ] Step to ISO/IEC 27001:2022 Annex A: 8.24 -- these and no others
  - derived, intersects-with: BER.7.1 Etablierte Algorithmen bei der Schlüsselerzeugung; BER.7.6 Etablierte Algorithmen beim Transport; BER.7.8 Etablierte Algorithmen bei der Schlüsselnutzung; BER.7.15 Vorgehensweise nach Nutzung; KONF.2.2 Kryptographische Verfahren in IT-Systemen; KONF.10.2 Kryptographische Verfahren in Anwendungen; KONF.14.1 Verschlüsselung beim Transport
- [ ] The remark is our own wording, not the source's text

## Art.21.2.i

Text: Sicherheit des Personals, Konzepte für die Zugriffskontrolle und Management von Anlagen;

> Human resources security, access control policies and asset management (Nr. 9).

- [ ] Step to ISO/IEC 27001:2022 Annex A: 6.1, 6.2, 6.4, 6.5, 6.6, 5.9, 5.10, 5.11, 5.12, 5.15, 5.16, 5.17, 5.18, 8.2, 8.3 -- these and no others
  - derived, intersects-with: ARCH.2.4 Inventar der Netze; ARCH.4.1 Netzzugangskontrolle; ASST.2.1 Inventar der Informationen; ASST.2.1.1 Informationsverantwortung; ASST.2.2 Inventar der Systeme; ASST.2.3 Inventar der Anwendungen; ASST.2.4 Klassifizierung; ASST.3.1 Nutzungsvereinbarungen; BER.2.1 Person-Identität; BER.2.5 Deaktivierung bei Weggang; BER.3.1 Zentrales Management; BER.3.4 Protokollierung von Änderungen; BER.3.5 Identität-Zugangskonto; BER.3.13 Sperre der Anwendung bei Inaktivität; BER.3.19 Gruppenkonten - Passwortwechsel bei Weggang; BER.5.1 Ausgabe, Registrierung und Zuordnung; BER.5.2 Zurücksetzung und Ersetzung von Authentifizierungsmitteln; BER.5.3 Vorgehensweise zum Widerruf; BER.5.8 Mehr-Faktor-Authentisierung am Perimeter; BER.6.1 Passwortmanager; BER.6.5 Anlassbezogene Passwortwechsel; BES.6.6 Rückgewähr von Assets; GEB.3.3 Authentifizierung vor Zutritt; KONF.6.5 Dynamische Zugriffskontrolle im System; KONF.6.13 Dynamische Zugriffskontrolle in der Anwendung; PERS.3.1 Dienst- oder Arbeitsvertrag; PERS.3.2 Verfahrensanweisungen; PERS.3.3 Betriebs- und Geschäftsgeheimnisse; PERS.3.5 Prüfung der Bewerbungsunterlagen; PERS.3.6 Vertrauenswürdigkeit von Bewerbenden; PERS.3.6.1 Sicherheitsüberprüfung (intern); PERS.5.1 Maßregelung; PERS.6.1 Vorgehensweise für den Weggang; PERS.6.1.1 Entzug von Berechtigungen gemäß BER; PERS.6.1.2 Neubesetzung; SENS.4.1 Personengebundene Authentisierungsmittel; SENS.4.1.4 Passwörter nur im Passwortmanager; SENS.4.1.6 Keine Weitergabe personengebundener Authentisierungsmittel; SENS.8.6 Begleitung Externer; SENS.10.2 Umgang mit privilegierten Berechtigungen
- [ ] The remark is our own wording, not the source's text

## Art.21.2.j

Text: Verwendung von Lösungen zur Multi-Faktor-Authentifizierung oder kontinuierlichen Authentifizierung, gesicherte Sprach-, Video- und Textkommunikation sowie gegebenenfalls gesicherte Notfallkommunikationssysteme innerhalb der Einrichtung.

> Multi-factor or continuous authentication, secured voice, video and text communications, and secured emergency communication systems (Nr. 10). Annex A has authentication and information transfer; MFA itself is a direct target.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 8.5, 5.14, 8.20, 8.21 -- these and no others
  - derived, intersects-with: ARCH.4.1 Netzzugangskontrolle; ARCH.5.1 Einschränkung und Inspektion von Verbindungen; ARCH.5.2 Blockieren direkter öffentlicher Verbindungen; ARCH.6.1 Kontrollierte Verbindungsführung; ASST.4.1 Autorisierung von Schnittstellen; ASST.4.2 Vertraulichkeit und Integrität beim Transport; ASST.4.5 Vereinbarungen zum Austausch; BER.6.4 Kriterien für die Qualität von Passwörtern; BER.6.5 Anlassbezogene Passwortwechsel; BES.5.2 Service Level Agreement; DLS.3.1.1 Audit oder Zertifikat; KONF.5.1 Authentifizierung am System; KONF.11.1 Authentifizierung vor dem Zugriff
- [ ] Direct targets, intersects-with: BER.5.8 Mehr-Faktor-Authentisierung am Perimeter; BER.5.9 Mehr-Faktor-Authentisierung für weitreichende Berechtigungen
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Left out

Targets of the BSI mapping not in the catalog, left out (13): BER.5.1.2 (iso27001 8.2); BER.6.8 (iso27001 5.17); BER.6.8 (iso27001 8.5); DET.3.1.13 (iso27001 5.23); GC.6.1.2 (iso27001 5.4); GC.6.1.3 (iso27001 5.1); GC.6.1.3 (iso27001 5.4); GC.6.1.4 (iso27001 5.1); GC.8.1.1 (iso27001 5.2); GC.8.1.1.1 (iso27001 5.4); GC.8.1.4 (iso27001 5.2); PERF.5.1.4 (iso27001 5.35); PERF.7.1 (iso27001 5.1)
