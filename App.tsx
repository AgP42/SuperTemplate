/**
 * SuperTemplate — configuration screen (opened by the toolbar button).
 * Visual language shared with the Dashboard plugin (same chips, section
 * labels, header and nav bar) so the plugin family feels consistent.
 * E-ink friendly: pure black & white, no animation.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {
  DATE_FORMATS,
  FONT_SIZES,
  HEADING_STYLES,
  HEADING_FONT_SIZES,
  HEADING_FONTS,
  DEFAULT_CONFIG,
  listUserFonts,
  loadConfig,
  saveConfig,
} from './src/config';
import {SUPPORTED_LANGS, formatStamp} from './src/utils/datetime';
import {installBundledTemplates} from './src/templatesInstall';
import {flushLog} from './src/utils/logger';

type Config = typeof DEFAULT_CONFIG;

const HEADING_LOOKS: {[k: number]: {bg: string; fg: string; shadow?: boolean}} =
  {
    1: {bg: '#000000', fg: '#ffffff'},
    2: {bg: '#999999', fg: '#ffffff'},
    3: {bg: '#cccccc', fg: '#000000'},
    4: {bg: '#ffffff', fg: '#000000', shadow: true},
  };

/** Rounded choice chip — Dashboard's `choice`/`choiceOn` look. */
function Choice(props: {
  selected: boolean;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      style={[styles.choice, props.selected && styles.choiceOn]}
      onPress={props.onPress}>
      <Text
        style={[styles.choiceText, props.selected && styles.choiceTextOn]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/** Heading-style chip rendered like the actual on-page result. */
function StyleChoice(props: {
  styleKey: number;
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const look = HEADING_LOOKS[props.styleKey] || HEADING_LOOKS[1];
  return (
    <Pressable
      style={[
        styles.choice,
        {backgroundColor: look.bg},
        look.shadow && styles.shadowChoice,
        props.selected && styles.styleChoiceSelected,
      ]}
      onPress={props.onPress}>
      <Text style={[styles.choiceText, {color: look.fg}]}>{props.label}</Text>
    </Pressable>
  );
}

function Row(props: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{props.label}</Text>
      <View style={styles.rowChoices}>{props.children}</View>
    </View>
  );
}

/** Airy section with the Dashboard's uppercase letter-spaced label. */
function Section(props: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function App(): React.JSX.Element {
  const [config, setConfig] = useState<Config>({...DEFAULT_CONFIG});
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [tplStatus, setTplStatus] = useState<string>('');
  const [userFonts, setUserFonts] = useState<string[]>([]);

  useEffect(() => {
    loadConfig().then(c => setConfig({...c}));
    listUserFonts().then(setUserFonts);
  }, []);

  const update = (patch: Partial<Config>) => {
    setSaveStatus('');
    setConfig(prev => ({...prev, ...patch}));
  };

  const onSave = async () => {
    const ok = await saveConfig(config);
    setSaveStatus(ok ? 'Saved' : 'Save failed');
    if (ok) {
      PluginManager.closePluginView();
    }
  };

  const onInstallTemplates = async () => {
    setTplStatus('Installing…');
    const res = await installBundledTemplates();
    await flushLog('TEMPLATES');
    setTplStatus(
      res.installed.length
        ? `Installed: ${res.installed.join(', ')}`
        : `Failed: ${res.failed.join(', ') || 'nothing to install'}`,
    );
  };

  const now = new Date();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SuperTemplate</Text>
        <Pressable
          style={styles.iconBtn}
          onPress={() => PluginManager.closePluginView()}>
          <Text style={styles.iconText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.boxFrame}>
          <View style={styles.boxCap}>
            <Text style={styles.boxCapText}>HOW TO USE</Text>
          </View>
          <View style={styles.boxBody}>
            <Text style={styles.howtoStep}>
              1. Tap "Install / update templates" below. It copies the bundled
              template pages into MyStyle (re-run after a plugin update).
            </Text>
            <Text style={styles.howtoStep}>
              2. Create a note page with one of the SuperTemplate_simpleNote
              templates (black, light or no logo), or set it as your standard
              template.
            </Text>
            <Text style={styles.howtoStep}>
              3. Write your page title inside the title box, on the guide
              line.
            </Text>
            <Text style={styles.howtoStep}>
              4. Double-tap the logo area with your finger: your handwriting
              becomes the page heading (with OCR first, or not) and the
              datetime is stamped. An existing date is never touched: delete
              it first to re-stamp.
            </Text>
            <Text style={styles.howtoStep}>
              The plugin is always active once installed — nothing to open or
              start: just double-tap on any template page. The toolbar button
              only opens this settings screen.
            </Text>
          </View>
        </View>

        <Section title="Template">
          <View style={styles.inlineRow}>
            <Pressable style={styles.btn} onPress={onInstallTemplates}>
              <Text style={styles.btnText}>▤ Install / update templates</Text>
            </Pressable>
            <Text style={styles.hint}>
              {tplStatus !== ''
                ? tplStatus
                : 'Copies the 3 bundled template pages into MyStyle.'}
            </Text>
          </View>
        </Section>

        <Section title="Datetime">
          <Row label="Language">
            {SUPPORTED_LANGS.map(l => (
              <Choice
                key={l}
                label={l.toUpperCase()}
                selected={config.language === l}
                onPress={() => update({language: l})}
              />
            ))}
          </Row>
          <Row label="Format">
            {DATE_FORMATS.map(f => (
              <Choice
                key={f.key}
                label={formatStamp(now, f.key, config.language)}
                selected={config.dateFormat === f.key}
                onPress={() => update({dateFormat: f.key})}
              />
            ))}
          </Row>
          <Row label="Text size">
            {FONT_SIZES.map(s => (
              <Choice
                key={s.key}
                label={s.key}
                selected={config.fontSize === s.value}
                onPress={() => update({fontSize: s.value})}
              />
            ))}
          </Row>
          <Row label="Keyword">
            <Choice
              label="Off"
              selected={config.keyword === false}
              onPress={() => update({keyword: false})}
            />
            {['YYYYMMDD', 'YYYY-MM-DD', 'DD/MM/YYYY', 'YYYY-MM'].map(f => (
              <Choice
                key={f}
                label={f}
                selected={config.keyword === true && config.keywordFormat === f}
                onPress={() => update({keyword: true, keywordFormat: f})}
              />
            ))}
          </Row>
          <Text style={styles.hint}>
            The keyword links the stamped date to the page, so it can be found
            later with Supernote's search or other plugins using keywords.
          </Text>
        </Section>

        <Section title="Heading">
          <Row label="OCR">
            <Choice
              label="Off — keep handwriting"
              selected={config.headingOcr === false}
              onPress={() => update({headingOcr: false})}
            />
            <Choice
              label="On — convert to text first"
              selected={config.headingOcr === true}
              onPress={() => update({headingOcr: true})}
            />
          </Row>
          {config.headingOcr === true && (
            <>
              <Row label="OCR font">
                {HEADING_FONTS.map(f => (
                  <Choice
                    key={f.key}
                    label={f.label}
                    selected={config.headingFont === f.key}
                    onPress={() => update({headingFont: f.key})}
                  />
                ))}
                {userFonts.map(fn => (
                  <Choice
                    key={fn}
                    label={fn.replace(/\.(ttf|otf)$/i, '')}
                    selected={config.headingFont === fn}
                    onPress={() => update({headingFont: fn})}
                  />
                ))}
              </Row>
              <Text style={styles.hint}>
                Your own fonts: drop .ttf/.otf files into MyStyle/fonts and
                reopen this screen.
              </Text>
              <Row label="OCR size">
                {HEADING_FONT_SIZES.map(s => (
                  <Choice
                    key={s.key}
                    label={s.key}
                    selected={config.headingFontSize === s.value}
                    onPress={() => update({headingFontSize: s.value})}
                  />
                ))}
              </Row>
            </>
          )}
          <Row label="Default">
            {HEADING_STYLES.map(h => (
              <StyleChoice
                key={h.key}
                styleKey={h.key}
                label={h.label}
                selected={config.headingStyle === h.key}
                onPress={() => update({headingStyle: h.key})}
              />
            ))}
          </Row>
          <Row label="Underlined">
            {HEADING_STYLES.map(h => (
              <StyleChoice
                key={h.key}
                styleKey={h.key}
                label={h.label}
                selected={config.styleUnderline === h.key}
                onPress={() => update({styleUnderline: h.key})}
              />
            ))}
          </Row>
          <Row label="2× underl.">
            {HEADING_STYLES.map(h => (
              <StyleChoice
                key={h.key}
                styleKey={h.key}
                label={h.label}
                selected={config.styleDoubleUnderline === h.key}
                onPress={() => update({styleDoubleUnderline: h.key})}
              />
            ))}
          </Row>
          <Text style={styles.hint}>
            Underline your handwritten title (or double-underline it) to pick
            its style with the pen — no settings needed.
          </Text>
        </Section>

        <Section title="Logs">
          <View style={styles.inlineRow}>
            <Choice
              label="Enable logs"
              selected={config.logging === true}
              onPress={() => update({logging: !config.logging})}
            />
            <Text style={styles.hint}>
              Off by default. Writes diagnostics to
              MyStyle/Plugins/SuperTemplate/ — enable it for bug reports.
            </Text>
          </View>
        </Section>
      </ScrollView>

      <View style={styles.navBar}>
        <View style={styles.navLeft}>
          {saveStatus !== '' && <Text style={styles.hint}>{saveStatus}</Text>}
        </View>
        <Pressable style={[styles.navBtn, styles.navBtnPri]} onPress={onSave}>
          <Text style={[styles.navBtnText, styles.navBtnTextPri]}>
            ✓ Save & close
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// Styles lifted from the Dashboard plugin's shared UI (src/ui.tsx) so the
// two plugins read as one family.
const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#ffffff', padding: 14},
  scroll: {flex: 1},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {fontSize: 24, fontWeight: '700', color: '#000000', flexShrink: 1},
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginLeft: 6,
  },
  iconText: {fontSize: 18, fontWeight: '700', color: '#000000'},
  section: {marginTop: 14},
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.3,
    fontWeight: '700',
    color: '#666666',
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  boxFrame: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  boxCap: {
    backgroundColor: '#000000',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  boxCapText: {color: '#ffffff', fontWeight: '700', fontSize: 13},
  boxBody: {paddingVertical: 7, paddingHorizontal: 10, gap: 3},
  howtoStep: {fontSize: 12.5, color: '#000000', lineHeight: 17},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2},
  rowLabel: {fontSize: 11, color: '#666666', width: 88},
  rowChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    alignItems: 'center',
  },
  inlineRow: {flexDirection: 'row', alignItems: 'center', gap: 14},
  hint: {fontSize: 12, color: '#000000', flex: 1, flexWrap: 'wrap'},
  choice: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  choiceOn: {backgroundColor: '#000000'},
  choiceText: {fontSize: 14, color: '#000000', fontWeight: '600'},
  choiceTextOn: {color: '#ffffff'},
  styleChoiceSelected: {borderWidth: 4},
  shadowChoice: {
    shadowColor: '#000',
    shadowOffset: {width: 3, height: 3},
    shadowOpacity: 0.6,
    shadowRadius: 0,
    elevation: 4,
  },
  btn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  btnText: {fontSize: 15, fontWeight: '600', color: '#000000'},
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderColor: '#dddddd',
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  navBtn: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  navBtnPri: {backgroundColor: '#000000'},
  navBtnText: {fontSize: 14, fontWeight: '700', color: '#000000'},
  navBtnTextPri: {color: '#ffffff'},
});

export default App;
