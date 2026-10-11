# Review: DORA (Regulation (EU) 2022/2554) Chapters II to V to Grundschutz++

Version 0.1.0 · status draft · catalog Grundschutz++-resolved_catalog.json at a128311

Source: Regulation (EU) 2022/2554 (DORA), Art. 5 to 30 (https://eur-lex.europa.eu/eli/reg/2022/2554/oj). Check every section against the original text, not against the remark.
Derived targets come from the BSI's own mapping and are only as right as the step to it; a direct target is this repository's judgement.

## Art.5

> Governance and organisation: the management body defines, approves and is accountable for the ICT risk management framework.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.1, 5.2, 5.4 -- these and no others
  - derived, intersects-with: GC.9.1 Festlegung einer Sicherheitsorganisation; SENS.11.1 Sensibilisierung der Institutionsleitung; SENS.11.2 Führen als Vorbild
- [ ] Direct targets, intersects-with: GC.1.2 Freigabe des ISMS; GC.5.1.2 Verpflichtung der Institutionsleitung; PERF.4.2 Bericht an die Institutionsleitung; RISK.1.5 Freigabe des Risikomanagements
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.6

> ICT risk management framework: strategies, policies, procedures, its yearly review and the digital operational resilience strategy.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.1, 5.31, 5.35 -- these and no others
  - derived, intersects-with: GC.7.1.1 Festlegung der Geschäftsprozesse; GC.9.1 Festlegung einer Sicherheitsorganisation; PERF.2.1 Überprüfung der Einhaltung von Verpflichtungen; PERF.3.1.1 Erstellen eines Auditsplans; PERF.3.1.3 Auswahl des Auditteams
- [ ] Direct targets, intersects-with: GC.5.1.1 Festlegung einer Sicherheitsstrategie; GC.12.1 Methodik für das Risikomanagement; RISK.1.1 Methodik für das Risikomanagement; RISK.1.3 Risikoeigentümer
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.7

> ICT systems, protocols and tools: appropriate, reliable, with sufficient capacity and technologically resilient.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 8.6, 8.9, 8.14 -- these and no others
  - derived, intersects-with: ARCH.8.1 Redundanz im Kernnetz; ARCH.8.2 Redundante TK-Anbindung; ARCH.8.3 Redundante Server; ARCH.9.1 Dimensionierung der Netzanbindung; ARCH.9.2 Lastverteilung; ARCH.9.3 Automatische Skalierung; DET.4.15 Ressourcenauslastung von Hostsystemen; DET.4.16 Ressourcenauslastung der Server-Dienste; GEB.9.1.3 Redundante Stromversorgung; GEB.10.1.3 Redundante Klimatisierung; KONF.2.1 Grundkonfiguration für Systeme; KONF.2.1.1 Versionierung der Systemkonfiguration; KONF.2.5 Überprüfung der Konfiguration; KONF.9.1 Speicherplatzbegrenzung; KONF.9.2 Begrenzung der Rechenleistung; KONF.10.1 Grundkonfiguration für Anwendungen; KONF.10.5 Überprüfung der Konfiguration
- [ ] Direct targets, intersects-with: DET.4.17 Anwendungsbasiertes Kapazitätsmanagement
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.8

> Identification: ICT-supported business functions, information assets, their dependencies, risks and a yearly risk assessment of legacy systems.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.9, 5.12 -- these and no others
  - derived, intersects-with: ARCH.2.4 Inventar der Netze; ASST.2.1 Inventar der Informationen; ASST.2.1.1 Informationsverantwortung; ASST.2.2 Inventar der Systeme; ASST.2.3 Inventar der Anwendungen; ASST.2.4 Klassifizierung
- [ ] Direct targets, intersects-with: GC.7.1.2 Festlegung des Schutzbedarfs; STM.4.1 Durchführung der Risikobetrachtung
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.9

> Protection and prevention: security policies, network and access management, authentication, encryption, change and patch management.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.14, 5.15, 5.17, 5.18, 8.2, 8.3, 8.5, 8.9, 8.12, 8.20, 8.21, 8.22, 8.24, 8.32 -- these and no others
  - derived, intersects-with: ARCH.2.1 Netzsegmente; ARCH.2.2 Einschränkung von Verbindungen zwischen Segmenten; ARCH.2.3 Mikrosegmentierung; ARCH.4.1 Netzzugangskontrolle; ARCH.5.1 Einschränkung und Inspektion von Verbindungen; ARCH.5.2 Blockieren direkter öffentlicher Verbindungen; ARCH.6.1 Kontrollierte Verbindungsführung; ASST.3.10 Autorisierung von Datenlokationen; ASST.3.11 Autorisierung von Systemen; ASST.3.12 Autorisierung von Personen oder Institutionen; ASST.4.1 Autorisierung von Schnittstellen; ASST.4.2 Vertraulichkeit und Integrität beim Transport; ASST.4.3 Autorisierung von Veröffentlichungen; ASST.4.5 Vereinbarungen zum Austausch; BER.3.5 Identität-Zugangskonto; BER.3.19 Gruppenkonten - Passwortwechsel bei Weggang; BER.5.1 Vorgehensweise zur Ausgabe; BER.5.2 Vorgehensweise zur Zurücksetzung; BER.5.3 Vorgehensweise zum Widerruf; BER.5.8 Mehr-Faktor-Authentisierung am Perimeter; BER.6.1 Passwortmanager; BER.6.4 Kriterien für die Qualität von Passwörtern; BER.6.5 Anlassbezogene Passwortwechsel; BER.7.1 Etablierte Algorithmen bei der Schlüsselerzeugung; BER.7.6 Etablierte Algorithmen beim Transport; BER.7.8 Etablierte Algorithmen bei der Schlüsselnutzung; BER.7.15 Vorgehensweise nach Nutzung; BES.5.2 Service Level Agreement; DET.4.5 Unerwünschte Datenabflüsse; DLS.3.1.1 Audit oder Zertifikat; GEB.3.3 Authentifizierung vor Zutritt; KONF.2.1 Grundkonfiguration für Systeme; KONF.2.1.1 Versionierung der Systemkonfiguration; KONF.2.2 Kryptographische Verfahren in IT-Systemen; KONF.2.5 Überprüfung der Konfiguration; KONF.5.1 Authentifizierung am System; KONF.6.5 Dynamische Zugriffskontrolle im System; KONF.6.13 Dynamische Zugriffskontrolle in der Anwendung; KONF.10.1 Grundkonfiguration für Anwendungen; KONF.10.2 Kryptographische Verfahren in Anwendungen; KONF.10.5 Überprüfung der Konfiguration; KONF.11.1 Authentifizierung vor dem Zugriff; KONF.14.1 Verschlüsselung beim Transport; SENS.4.1 Personengebundene Authentisierungsmittel; SENS.4.1.4 Passwörter nur im Passwortmanager; SENS.4.1.6 Keine Weitergabe personengebundener Authentisierungsmittel; SENS.10.2 Umgang mit privilegierten Berechtigungen; TEST.1.1 Verfahren und Regelungen; TEST.1.3 Einschränkung von Änderungen; TEST.2.1 Versionshistorie; TEST.2.2 Folgenabschätzung; TEST.4.1 Autorisierung von Änderungen; TEST.4.3 Rückfallösung; TEST.4.4 Geregelte Notfalländerungen; TEST.5.5 Rückblick
- [ ] The remark is our own wording, not the source's text

## Art.10

> Detection of anomalous activities, with multiple layers of control and alert thresholds.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 8.15, 8.16 -- these and no others
  - derived, intersects-with: DET.3.1 Protokollierung sicherheitsrelevanter Ereignisse; DET.3.2 Integration von Cloud-Diensten; DET.3.3 Filterung nicht benötigter Inhalte; DET.3.4 Speicherkapazität; DET.4.1 Überwachung der Protokollierung; DET.4.2 Automatische Angriffserkennung; DET.4.3 Überwachung der Angriffserkennung; DET.4.6 Anomale Nutzung der Anwendung; DET.4.11 Anomalien in Netzen und am Perimeter; DET.4.12 Monitoring der Netzverfügbarkeit; DET.4.13 Verfügbarkeit des Hostsystems; DET.4.14 Verfügbarkeit der Anwendung
- [ ] The remark is our own wording, not the source's text

## Art.11

> Response and recovery: ICT business continuity policy, response and recovery plans, their testing, and crisis management.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.24, 5.26, 5.29, 5.30 -- these and no others
  - derived, intersects-with: DET.2.1 Meldeverfahren; NOT.1.1.4 Business Continuity Management System; NOT.3.2 Geschäftsfortführungsplan; NOT.3.6 Sicherheitsmechanismen; NOT.4.2 Sicherung des Systems; NOT.4.3 Sicherung der Anwendung; NOT.4.15 Vorgehen zur Wiederherstellung; NOT.4.16 Test der Datensicherung; REA.1.1 Verfahren und Regelungen; REA.1.3 Übungen zur Vorfallsbehandlung; REA.2.1 Triage und Erstreaktion; REA.2.2 Automatische Erstreaktion; REA.2.6 Ursachenanalyse und Behandlung
- [ ] Direct targets, intersects-with: NOT.2.1 Verfahren und Regelungen zur BAO; NOT.3.1 Wiederanlaufplan
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.12

> Backup policies, restoration and recovery procedures, and their testing.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 8.13, 8.14 -- these and no others
  - derived, intersects-with: ARCH.8.1 Redundanz im Kernnetz; ARCH.8.2 Redundante TK-Anbindung; ARCH.8.3 Redundante Server; GEB.9.1.3 Redundante Stromversorgung; GEB.10.1.3 Redundante Klimatisierung; NOT.4.2 Sicherung des Systems; NOT.4.3 Sicherung der Anwendung; NOT.4.4 Automatische Datensicherung; NOT.4.6 Geschützte Aufbewahrung; NOT.4.7 Versionierte Datensicherung; NOT.4.8 Verschlüsselte Datensicherung; NOT.4.10 Getrennte Aufbewahrung; NOT.4.14 Offline-Kopie; NOT.4.16 Test der Datensicherung
- [ ] Direct targets, intersects-with: NOT.4.15 Vorgehen zur Wiederherstellung; NOT.4.16.1 Test der Wiederherstellung
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.13

> Learning and evolving: post-incident reviews, lessons learned, and training for staff and the management body.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.27, 6.3 -- these and no others
  - derived, intersects-with: BES.5.7 Schulung; PERS.4.1 Qualifikationsbedarf; PERS.4.2 Rollenspezifische Schulungen und Sensibilisierungen; SENS.1.1 Verfahren und Regelungen
- [ ] Direct targets, intersects-with: REA.3.1 Verbesserung durch Erkenntnisse; VRB.6.1 Überprüfung der erreichten Verbesserung
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.14

> Communication: crisis communication plans for clients, counterparts and the public, and a designated person for media. Annex A only has contact with authorities and interested parties.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.5, 5.6 -- these and no others
  - derived, intersects-with: GC.9.1 Festlegung einer Sicherheitsorganisation; GC.9.1.1 Festlegung von Rollen und Zuständigkeiten
- [ ] The remark is our own wording, not the source's text

## Art.16

Not mapped: Simplified ICT risk management framework for small entities, an alternative to Art. 5 to 15; map through those.

- [ ] No requirement of the catalog fits; the reason holds

## Art.17

> ICT-related incident management process: detect, manage, record and notify incidents.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.24, 5.25, 5.26, 6.8 -- these and no others
  - derived, intersects-with: DET.6.1 Beurteilung von Ereignissen; REA.1.1 Verfahren und Regelungen; REA.1.3 Übungen zur Vorfallsbehandlung; REA.2.2 Automatische Erstreaktion; REA.2.6 Ursachenanalyse und Behandlung; SENS.2.8 Melden von Ereignissen
- [ ] Direct targets, intersects-with: DET.2.1 Meldeverfahren; REA.2.1 Triage und Erstreaktion
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.18

> Classification of ICT-related incidents and cyber threats by the criteria DORA sets out. Grundschutz++ prioritises incidents but has no classification by those criteria.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.25 -- these and no others
  - derived, intersects-with: DET.6.1 Beurteilung von Ereignissen
- [ ] Direct targets, intersects-with: REA.2.1 Triage und Erstreaktion
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.19

Not mapped: Reporting of major incidents to the competent authority; Grundschutz++ has no requirement for reports to a supervisor.

- [ ] No requirement of the catalog fits; the reason holds

## Art.24

> Digital operational resilience testing programme, risk-based, at least yearly for critical systems.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.35, 8.29 -- these and no others
  - derived, intersects-with: DEV.4.11 Test bei Änderungen am Quellcode; DEV.6.1 Freigabe nach Änderungen und Tests; PERF.3.1.1 Erstellen eines Auditsplans; PERF.3.1.3 Auswahl des Auditteams; TEST.3.1 Sicherheitstest; TEST.3.1.1 Dokumentation von Testergebnissen; TEST.3.1.4 Testdaten; TEST.3.1.5 Testumgebung; TEST.3.1.10 Lasttest
- [ ] Direct targets, intersects-with: REA.1.3 Übungen zur Vorfallsbehandlung
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.25

> Testing of ICT tools and systems: vulnerability assessments and scans, network security assessments, scenario-based tests, penetration tests.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 8.8, 8.29 -- these and no others
  - derived, intersects-with: DET.5.1 Zeitnahes Schwachstellenmanagement; DET.5.2 Schwachstellenregister; DET.5.9 Externe Schwachstellenmeldungen; DET.5.10 Zeitnahes Patchmanagement; DEV.4.11 Test bei Änderungen am Quellcode; DEV.6.1 Freigabe nach Änderungen und Tests; TEST.3.1 Sicherheitstest; TEST.3.1.1 Dokumentation von Testergebnissen; TEST.3.1.4 Testdaten; TEST.3.1.5 Testumgebung; TEST.3.1.10 Lasttest
- [ ] Direct targets, intersects-with: DET.5.3 Schwachstellenscans; DET.5.4 Regelmäßige Penetrationstests; TEST.3.1.11 Penetrationstest bei Änderungen
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.26

> Threat-led penetration testing (TLPT) for designated entities. Grundschutz++ has regular penetration tests, not the TIBER-EU style test with external testers and authority involvement.

- [ ] Direct targets, intersects-with: DET.5.4 Regelmäßige Penetrationstests
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.28

> ICT third-party risk: strategy, register of information, due diligence, exit strategies.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.19, 5.20, 5.21, 5.22, 5.23 -- these and no others
  - derived, intersects-with: BES.1.3 Lieferanten- und Dienstleisterverzeichnis; BES.1.3.1 Gesamte Lieferkette; BES.1.4 Outsourcing-Strategie; BES.1.7 Vereinbarung der geteilten Verantwortung; BES.2.2 Dokumentation des Rechtsraums und der Datenlokation; BES.2.3 Vereinbarung des Rechtsraums und der Datenlokation; BES.3.1 Klassifizierung von Lieferantenbeziehungen; BES.4.4 Vertragsvorlage für Outsourcing; BES.4.5 Security by Design; BES.4.5.1 Entwicklung nach einem Sicherheitslebenszyklus; BES.4.8 Konformitätsnachweise; BES.5.2 Service Level Agreement; BES.5.3 Compliance-Verpflichtungen; BES.5.4 Informationssicherheitskontrollmechanismen; BES.5.5.1 Datenlokationen; BES.5.6.3 Nachverfolgbarkeit der Lieferkette; BES.5.9 Umgang mit Änderungen; BES.5.11 Recht auf Audit; BES.5.12 Informationspflichten; BES.6.3 Übertragbarkeit von Daten; BES.7.4.4.1 Software Bill of Materials (SBOM); BES.7.4.12 Software Bill of Materials (SBOM) - Cloud; DLS.3.1 Einhaltung der Sicherheitsvorgaben; DLS.3.2 Checkup; DLS.3.6 Portabilität; DLS.4.1 Dekomissionierung
- [ ] Direct targets, intersects-with: BES.8.2 Verfahren zur Übertragung von Geschäftsprozessen; BES.8.3 Ressourcensouveränität; DLS.1.1 Verfahren und Regelungen
- [ ] Relationship: intersects-with holds (or the targets cover all of the source: then subset-of)
- [ ] The remark is our own wording, not the source's text

## Art.29

> Preliminary assessment of ICT concentration risk before contracting.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.19 -- these and no others
  - derived, intersects-with: BES.1.3 Lieferanten- und Dienstleisterverzeichnis; BES.3.1 Klassifizierung von Lieferantenbeziehungen; BES.5.4 Informationssicherheitskontrollmechanismen
- [ ] The remark is our own wording, not the source's text

## Art.30

> Key contractual provisions for ICT services, more for critical or important functions.

- [ ] Step to ISO/IEC 27001:2022 Annex A: 5.20, 5.23 -- these and no others
  - derived, intersects-with: BES.1.4 Outsourcing-Strategie; BES.1.7 Vereinbarung der geteilten Verantwortung; BES.2.2 Dokumentation des Rechtsraums und der Datenlokation; BES.2.3 Vereinbarung des Rechtsraums und der Datenlokation; BES.4.4 Vertragsvorlage für Outsourcing; BES.5.2 Service Level Agreement; BES.5.3 Compliance-Verpflichtungen; BES.5.4 Informationssicherheitskontrollmechanismen; BES.5.5.1 Datenlokationen; BES.5.11 Recht auf Audit; BES.5.12 Informationspflichten; BES.6.3 Übertragbarkeit von Daten; DLS.3.6 Portabilität; DLS.4.1 Dekomissionierung
- [ ] The remark is our own wording, not the source's text

## Left out

Targets of the BSI mapping not in the catalog, left out (14): BER.5.1.2 (iso27001 8.2); BER.6.8 (iso27001 5.17); BER.6.8 (iso27001 8.5); DET.3.1.13 (iso27001 5.23); GC.6.1.2 (iso27001 5.4); GC.6.1.3 (iso27001 5.1); GC.6.1.3 (iso27001 5.4); GC.6.1.4 (iso27001 5.1); GC.7.1.3 (iso27001 5.31); GC.8.1.1 (iso27001 5.2); GC.8.1.1.1 (iso27001 5.4); GC.8.1.4 (iso27001 5.2); PERF.5.1.4 (iso27001 5.35); PERF.7.1 (iso27001 5.1)
