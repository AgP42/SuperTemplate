/**
 * SuperTemplate — configuration screen (opened by the toolbar button).
 * E-ink friendly: pure black & white, three delimited blocks, fits one page.
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

function Choice(props: {
  selected: boolean;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      style={[styles.choice, props.selected && styles.choiceSelected]}
      onPress={props.onPress}>
      <Text
        style={[
          styles.choiceText,
          props.selected && styles.choiceTextSelected,
        ]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/** Heading-style choice rendered like the actual on-page result. */
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
      <Text style={[styles.choiceText, {color: look.fg, fontWeight: 'bold'}]}>
        {props.label}
      </Text>
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

function Block(props: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function App(): React.JSX.Element {
  const [config, setConfig] = useState<Config>({...DEFAULT_CONFIG});
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [tplStatus, setTplStatus] = useState<string>('');

  useEffect(() => {
    loadConfig().then(c => setConfig({...c}));
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>SuperTemplate</Text>
      </View>

      <View style={styles.howto}>
        <Text style={styles.howtoTitle}>How to use</Text>
        <Text style={styles.howtoStep}>
          1. Tap "Install / update template" below. It will copy the bundled
          template page into MyStyle (re-run after a plugin update).
        </Text>
        <Text style={styles.howtoStep}>
          2. Manually create a note page with the SuperTemplate_simpleNote
          template, or set it up as your standard template.
        </Text>
        <Text style={styles.howtoStep}>
          3. Write your page title inside the title box.
        </Text>
        <Text style={styles.howtoStep}>
          4. Tap the S logo twice with your finger, about one second apart,
          and see the plugin do the magic: your handwriting becomes the page
          heading (with OCR first, or not) and the datetime is stamped. (A
          fast double-tap is Supernote's paste gesture — tap slowly.) An
          existing date is never touched: delete it first to re-stamp.
        </Text>
      </View>

      <Block title="1 · Template">
        <View style={styles.inlineRow}>
          <Pressable
            style={styles.buttonSecondary}
            onPress={onInstallTemplates}>
            <Text style={styles.buttonSecondaryText}>
              Install / update template
            </Text>
          </Pressable>
          <Text style={styles.inlineStatus}>
            {tplStatus !== ''
              ? tplStatus
              : 'Copies the bundled template page into MyStyle. Re-run after a plugin update.'}
          </Text>
        </View>
      </Block>

      <Block title="2 · Datetime">
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
        <Text style={styles.blockHint}>
          The keyword links the stamped date to the page, so it can be found
          later with Supernote's search or other plugins using keywords.
        </Text>
      </Block>

      <Block title="3 · Heading">
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
            </Row>
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
        <Row label="Style">
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
      </Block>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Logs</Text>
        <View style={styles.rowChoices}>
          <Choice
            label="Enable logs"
            selected={config.logging === true}
            onPress={() => update({logging: !config.logging})}
          />
          <Text style={styles.inlineStatus}>
            Off by default. Writes diagnostics to
            MyStyle/Plugins/SuperTemplate/ — enable it for bug reports.
          </Text>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          style={styles.buttonSecondary}
          onPress={() => PluginManager.closePluginView()}>
          <Text style={styles.buttonSecondaryText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.buttonPrimary} onPress={onSave}>
          <Text style={styles.buttonPrimaryText}>Save</Text>
        </Pressable>
        {saveStatus !== '' && (
          <Text style={styles.inlineStatus}>{saveStatus}</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#ffffff'},
  content: {padding: 24, paddingBottom: 24},
  header: {marginBottom: 8},
  title: {fontSize: 26, fontWeight: 'bold', color: '#000'},
  howto: {
    borderWidth: 1.5,
    borderColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    gap: 3,
  },
  howtoTitle: {fontSize: 15, fontWeight: 'bold', color: '#000'},
  howtoStep: {fontSize: 12.5, color: '#000', lineHeight: 17},
  block: {
    borderWidth: 2,
    borderColor: '#000',
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  blockTitle: {fontSize: 17, fontWeight: 'bold', color: '#000'},
  blockHint: {fontSize: 12, color: '#333'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  rowLabel: {fontSize: 14, fontWeight: 'bold', color: '#000', width: 88},
  rowChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
    alignItems: 'center',
  },
  inlineRow: {flexDirection: 'row', alignItems: 'center', gap: 14},
  inlineStatus: {fontSize: 13, color: '#000', flex: 1, flexWrap: 'wrap'},
  choice: {
    borderWidth: 1.5,
    borderColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  choiceSelected: {backgroundColor: '#000'},
  choiceText: {fontSize: 14, color: '#000'},
  choiceTextSelected: {color: '#fff'},
  styleChoiceSelected: {borderWidth: 4},
  shadowChoice: {
    shadowColor: '#000',
    shadowOffset: {width: 3, height: 3},
    shadowOpacity: 0.6,
    shadowRadius: 0,
    elevation: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 4,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#000',
    paddingVertical: 11,
    paddingHorizontal: 34,
  },
  buttonPrimaryText: {fontSize: 17, color: '#fff', fontWeight: 'bold'},
  buttonSecondary: {
    borderWidth: 2,
    borderColor: '#000',
    paddingVertical: 11,
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  buttonSecondaryText: {fontSize: 15, color: '#000'},
});

export default App;
