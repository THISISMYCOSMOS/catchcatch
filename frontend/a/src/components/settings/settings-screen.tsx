"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthenticatedAppFrame } from "@/components/home/authenticated-app-frame";
import styles from "@/components/preferences/preferences.module.css";
import { restoreAuthenticatedUser } from "@/lib/api/auth";

type NotificationSettings = {
  sale: boolean;
  price: boolean;
  analysis: boolean;
  push: boolean;
};

const STORAGE_KEY = "catchcatch:notification-settings";
const DEFAULT_SETTINGS: NotificationSettings = {
  sale: true,
  price: true,
  analysis: true,
  push: true,
};

function readSettings() {
  try {
    const savedSettings = window.localStorage.getItem(STORAGE_KEY);
    if (!savedSettings) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) } as NotificationSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function SettingSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className={styles.settingRow}>
      <div>
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <button
        className={`${styles.switch} ${checked ? styles.switchEnabled : ""}`}
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    void restoreAuthenticatedUser().then((user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      if (cancelled) return;
      setSettings(readSettings());
      setIsAuthorized(true);
    });
    return () => { cancelled = true; };
  }, [router]);

  if (!isAuthorized) return null;

  function toggleSetting(key: keyof NotificationSettings) {
    setSettings((current) => {
      const next = { ...current, [key]: !current[key] };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <AuthenticatedAppFrame
      pageClassName="home-page feature-page"
      shellClassName="home-mobile-shell feature-shell"
      headerClassName="home-header feature-header"
    >
      <section className={styles.pageHeading} aria-labelledby="settings-title">
        <h1 className="section-page-title" id="settings-title">설정</h1>
      </section>

      <section className={styles.settingsSection} aria-labelledby="notification-settings-title">
        <h2 id="notification-settings-title">알림 설정</h2>
        <div className={styles.settingsCard}>
          <SettingSwitch
            label="세일 알림"
            description="관심 상품의 세일 시작과 종료를 알려드려요."
            checked={settings.sale}
            onChange={() => toggleSetting("sale")}
          />
          <SettingSwitch
            label="가격 변동 알림"
            description="관심 상품의 가격이 바뀌면 알려드려요."
            checked={settings.price}
            onChange={() => toggleSetting("price")}
          />
          <SettingSwitch
            label="분석 완료 알림"
            description="상품 분석이 끝나면 바로 알려드려요."
            checked={settings.analysis}
            onChange={() => toggleSetting("analysis")}
          />
        </div>
      </section>

      <section className={styles.settingsSection} aria-labelledby="app-settings-title">
        <h2 id="app-settings-title">앱 설정</h2>
        <div className={styles.settingsCard}>
          <SettingSwitch
            label="푸시 알림 설정"
            checked={settings.push}
            onChange={() => toggleSetting("push")}
          />
        </div>
      </section>

    </AuthenticatedAppFrame>
  );
}
