import React, { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import "./App.css";

// Store 实例
let store: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!store) {
    store = await load("settings.json", { autoSave: true, defaults: {} });
  }
  return store;
}

interface TimelineItem {
  time: string;
  status: number;
  latency: number;
  availability: number;
}

interface ProviderStatus {
  provider: string;
  service: string;
  channel: string;
  current_status: {
    status: number;
    latency: number;
  };
  timeline: TimelineItem[];
}

interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface BubbleConfig {
  enabled: boolean;
  provider: string;
  service: string;
  channel: string;
  size: number;
}

function CustomSelect({ options, value, onChange, placeholder }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const selectRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder || "请选择";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function updateDropdownPosition() {
      if (isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const spaceBelow = windowHeight - rect.bottom - 8;
        const maxHeight = Math.min(spaceBelow, 300);

        setDropdownStyle({
          position: "fixed",
          top: rect.bottom + 4,
          left: rect.left,
          minWidth: rect.width,
          maxHeight: maxHeight,
        });
      }
    }

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    return () => window.removeEventListener("resize", updateDropdownPosition);
  }, [isOpen]);

  const dropdown = isOpen && createPortal(
    <div className="select-dropdown" style={dropdownStyle}>
      {options.map((opt) => (
        <div
          key={opt.value}
          className={`select-option ${opt.value === value ? "selected" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onChange(opt.value);
            setIsOpen(false);
          }}
        >
          {opt.label}
        </div>
      ))}
    </div>,
    document.body
  );

  return (
    <div className="custom-select" ref={selectRef}>
      <div className="select-trigger" ref={triggerRef} onClick={() => setIsOpen(!isOpen)}>
        <span className="select-value">{selectedLabel}</span>
        <span className={`select-arrow ${isOpen ? "open" : ""}`}>▾</span>
      </div>
      {dropdown}
    </div>
  );
}

interface SettingsPageProps {
  onBack: () => void;
  allProviders: ProviderStatus[];
  bubbleConfig: BubbleConfig;
  onBubbleConfigChange: (config: BubbleConfig) => void;
}

function SettingsPage({ onBack, allProviders, bubbleConfig, onBubbleConfigChange }: SettingsPageProps) {
  const [autoStart, setAutoStart] = useState(false);
  const [interval, setIntervalValue] = useState(5);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const enabled = await isEnabled();
        setAutoStart(enabled);
        const ms: number = await invoke("get_interval");
        setIntervalValue(ms / 1000);
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
      setLoading(false);
    }
    loadSettings();
  }, []);

  async function handleAutoStartChange() {
    try {
      if (autoStart) {
        await disable();
        setAutoStart(false);
      } else {
        await enable();
        setAutoStart(true);
      }
    } catch (e) {
      console.error("Failed to toggle autostart:", e);
    }
  }

  async function handleIntervalChange(value: number) {
    setIntervalValue(value);
    await invoke("set_interval", { ms: value * 1000 });
  }

  const providerList = useMemo(() => {
    const set = new Set(allProviders.map((p) => p.provider));
    return Array.from(set).sort();
  }, [allProviders]);

  const serviceList = useMemo(() => {
    const filtered = bubbleConfig.provider
      ? allProviders.filter((p) => p.provider === bubbleConfig.provider)
      : allProviders;
    const set = new Set(filtered.map((p) => p.service));
    return Array.from(set).sort();
  }, [allProviders, bubbleConfig.provider]);

  const channelList = useMemo(() => {
    let filtered = allProviders;
    if (bubbleConfig.provider) {
      filtered = filtered.filter((p) => p.provider === bubbleConfig.provider);
    }
    if (bubbleConfig.service) {
      filtered = filtered.filter((p) => p.service === bubbleConfig.service);
    }
    const set = new Set(filtered.map((p) => p.channel));
    return Array.from(set).sort();
  }, [allProviders, bubbleConfig.provider, bubbleConfig.service]);

  const providerOptions: SelectOption[] = providerList.map((p) => ({ value: p, label: p }));
  const serviceOptions: SelectOption[] = serviceList.map((s) => ({ value: s, label: s.toUpperCase() }));
  const channelOptions: SelectOption[] = channelList.map((c) => ({ value: c, label: c }));

  function handleBubbleProviderChange(value: string) {
    onBubbleConfigChange({ ...bubbleConfig, provider: value, service: "", channel: "" });
  }

  function handleBubbleServiceChange(value: string) {
    onBubbleConfigChange({ ...bubbleConfig, service: value, channel: "" });
  }

  function handleBubbleChannelChange(value: string) {
    onBubbleConfigChange({ ...bubbleConfig, channel: value });
  }

  function handleBubbleEnabledChange() {
    const newEnabled = !bubbleConfig.enabled;
    onBubbleConfigChange({ ...bubbleConfig, enabled: newEnabled });
  }

  if (loading) {
    return (
      <div className="card">
        <div className="settings-header">
          <button className="back-btn" onClick={onBack}>←</button>
          <span className="settings-title">设置</span>
        </div>
        <div className="settings-loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <span className="settings-title">设置</span>
      </div>
      <div className="settings-content">
        <div className="setting-item">
          <div className="setting-label">
            <span className="setting-name">开机自启动</span>
            <span className="setting-desc">系统启动时自动运行</span>
          </div>
          <label className="switch">
            <input type="checkbox" checked={autoStart} onChange={handleAutoStartChange} />
            <span className="slider"></span>
          </label>
        </div>

        <div className="setting-item">
          <div className="setting-label">
            <span className="setting-name">刷新间隔</span>
            <span className="setting-desc">API 请求间隔时间</span>
          </div>
          <div className="interval-control">
            <button className="interval-btn" onClick={() => handleIntervalChange(Math.max(1, interval - 1))}>-</button>
            <span className="interval-value">{interval}s</span>
            <button className="interval-btn" onClick={() => handleIntervalChange(Math.min(60, interval + 1))}>+</button>
          </div>
        </div>

        <div className="setting-section">
          <span className="setting-section-title">悬浮球模式</span>
        </div>

        <div className="setting-item">
          <div className="setting-label">
            <span className="setting-name">启用悬浮球</span>
            <span className="setting-desc">显示单个监控状态</span>
          </div>
          <label className="switch">
            <input type="checkbox" checked={bubbleConfig.enabled} onChange={handleBubbleEnabledChange} />
            <span className="slider"></span>
          </label>
        </div>

        {!bubbleConfig.enabled && (
          <>
            <div className="setting-item">
              <div className="setting-label">
                <span className="setting-name">悬浮球大小</span>
                <span className="setting-desc">窗口尺寸 (80-200)</span>
              </div>
              <div className="interval-control">
                <button className="interval-btn" onClick={() => onBubbleConfigChange({ ...bubbleConfig, size: Math.max(80, bubbleConfig.size - 10) })}>-</button>
                <span className="interval-value">{bubbleConfig.size}</span>
                <button className="interval-btn" onClick={() => onBubbleConfigChange({ ...bubbleConfig, size: Math.min(200, bubbleConfig.size + 10) })}>+</button>
              </div>
            </div>

            <div className="setting-item column">
              <div className="setting-label">
                <span className="setting-name">供应商</span>
              </div>
              <CustomSelect
                options={providerOptions}
                value={bubbleConfig.provider}
                onChange={handleBubbleProviderChange}
                placeholder="选择供应商"
              />
            </div>

            <div className="setting-item column">
              <div className="setting-label">
                <span className="setting-name">服务</span>
              </div>
              <CustomSelect
                options={serviceOptions}
                value={bubbleConfig.service}
                onChange={handleBubbleServiceChange}
                placeholder="选择服务"
              />
            </div>

            <div className="setting-item column">
              <div className="setting-label">
                <span className="setting-name">通道</span>
              </div>
              <CustomSelect
                options={channelOptions}
                value={bubbleConfig.channel}
                onChange={handleBubbleChannelChange}
                placeholder="选择通道"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface BubbleViewProps {
  provider: ProviderStatus | null;
  onExpand: () => void;
  size: number;
}

function calcAvailability(timeline: TimelineItem[]): number {
  if (!timeline || timeline.length === 0) return 0;
  const total = timeline.reduce((sum, t) => sum + t.availability, 0);
  return total / timeline.length;
}

function BubbleView({ provider, onExpand, size }: BubbleViewProps) {
  const bubbleSize = size - 10; // 留出边距
  const scale = size / 120; // 基于120为基准计算缩放比例

  const fontSizes = {
    provider: Math.round(16 * scale),
    channel: Math.round(16* scale),
    availability: Math.round(22 * scale),
    unknown: Math.round(28 * scale),
  };

  if (!provider) {
    return (
      <div className="bubble-container">
        <div className="bubble" style={{ width: bubbleSize, height: bubbleSize }} onClick={onExpand}>
          <span className="bubble-text" style={{ fontSize: fontSizes.unknown }}>?</span>
        </div>
      </div>
    );
  }

  const isUp = provider.current_status.status === 1;
  const availability = calcAvailability(provider.timeline);
  const waterLevel = availability;

  return (
    <div className="bubble-container">
      <div className={`bubble ${isUp ? "up" : "down"}`} style={{ width: bubbleSize, height: bubbleSize }} onClick={onExpand}>
        <div className="bubble-wave" style={{ "--water-level": `${100 - waterLevel}%` } as React.CSSProperties}>
          <div className="wave wave1"></div>
          <div className="wave wave2"></div>
        </div>
        <div className="bubble-content">
          <span className="bubble-provider" style={{ fontSize: fontSizes.provider }}>{provider.provider}</span>
          <span className="bubble-availability" style={{ fontSize: fontSizes.availability }}>{availability.toFixed(0)}%</span>
          <span className="bubble-channel" style={{ fontSize: fontSizes.channel, maxWidth: bubbleSize * 0.75 }}>{provider.channel}</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [allProviders, setAllProviders] = useState<ProviderStatus[]>([]);
  const [providerFilter, setProviderFilter] = useState("88code");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [bubbleConfig, setBubbleConfig] = useState<BubbleConfig>({
    enabled: false,
    provider: "88code",
    service: "cc",
    channel: "",
    size: 120,
  });

  // 用 ref 记录是否是首次渲染
  const isFirstRender = useRef(true);

  async function loadStatus() {
    setRefreshing(true);
    try {
      const resp: any = await invoke("fetch_status");
      const data = resp.data;
      setAllProviders(data);
      setLoading(false);
      setLastUpdate(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (e) {
      console.error("Failed to fetch status:", e);
    }
    setRefreshing(false);
  }

  async function loopFetch() {
    const interval: number = await invoke("get_interval");
    await loadStatus();
    setTimeout(loopFetch, interval);
  }

  useEffect(() => {
    loopFetch();
  }, []);

  // 监听 bubbleConfig.enabled 变化来调整窗口
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    async function handleWindowChange() {
      const win = getCurrentWindow();
      const { LogicalSize, LogicalPosition } = await import("@tauri-apps/api/dpi");
      const store = await getStore();
      const scaleFactor = await win.scaleFactor();

      // 获取当前窗口状态（物理像素转逻辑像素）
      const currentSize = await win.innerSize();
      const currentPos = await win.outerPosition();
      const currentState = {
        x: Math.round(currentPos.x / scaleFactor),
        y: Math.round(currentPos.y / scaleFactor),
        width: Math.round(currentSize.width / scaleFactor),
        height: Math.round(currentSize.height / scaleFactor),
      };

      console.log("Current state:", currentState, "Scale factor:", scaleFactor);

      if (bubbleConfig.enabled) {
        // 切换到悬浮球模式：保存卡片位置，恢复悬浮球位置
        await store.set("cardWindowState", currentState);
        console.log("Saved card state:", currentState);

        const bubbleState = await store.get<{ x: number; y: number }>("bubbleWindowState");
        console.log("Restoring bubble state:", bubbleState);

        await win.setSize(new LogicalSize(bubbleConfig.size, bubbleConfig.size));
        if (bubbleState) {
          await win.setPosition(new LogicalPosition(bubbleState.x, bubbleState.y));
        }
      } else {
        // 切换到卡片模式：保存悬浮球位置，恢复卡片位置
        await store.set("bubbleWindowState", { x: currentState.x, y: currentState.y });
        console.log("Saved bubble state:", { x: currentState.x, y: currentState.y });

        const cardState = await store.get<{ x: number; y: number; width: number; height: number }>("cardWindowState");
        console.log("Restoring card state:", cardState);

        if (cardState) {
          await win.setSize(new LogicalSize(cardState.width, cardState.height));
          await win.setPosition(new LogicalPosition(cardState.x, cardState.y));
        } else {
          await win.setSize(new LogicalSize(520, 320));
        }
      }
    }
    handleWindowChange();
  }, [bubbleConfig.enabled]);

  const bubbleProvider = useMemo(() => {
    if (!bubbleConfig.enabled) return null;
    return allProviders.find(
      (p) =>
        p.provider === bubbleConfig.provider &&
        p.service === bubbleConfig.service &&
        p.channel === bubbleConfig.channel
    ) || null;
  }, [allProviders, bubbleConfig]);

  function handleBubbleConfigChange(config: BubbleConfig) {
    if (config.enabled && !bubbleConfig.enabled) {
      setShowSettings(false);
    }
    setBubbleConfig(config);
  }

  function handleExpandFromBubble() {
    setBubbleConfig({ ...bubbleConfig, enabled: false });
  }

  function handleProviderChange(value: string) {
    setProviderFilter(value);
    setChannelFilter("all");
  }

  function handleServiceChange(value: string) {
    setServiceFilter(value);
    setChannelFilter("all");
  }

  const providerList = useMemo(() => {
    const set = new Set(allProviders.map((p) => p.provider));
    return Array.from(set).sort();
  }, [allProviders]);

  const serviceList = useMemo(() => {
    const filtered = providerFilter === "all"
      ? allProviders
      : allProviders.filter((p) => p.provider === providerFilter);
    const set = new Set(filtered.map((p) => p.service));
    return Array.from(set).sort();
  }, [allProviders, providerFilter]);

  const channelList = useMemo(() => {
    let filtered = allProviders;
    if (providerFilter !== "all") {
      filtered = filtered.filter((p) => p.provider === providerFilter);
    }
    if (serviceFilter !== "all") {
      filtered = filtered.filter((p) => p.service === serviceFilter);
    }
    const set = new Set(filtered.map((p) => p.channel));
    return Array.from(set).sort();
  }, [allProviders, providerFilter, serviceFilter]);

  const filteredProviders = allProviders.filter((p) => {
    const providerMatch = providerFilter === "all" || p.provider === providerFilter;
    const serviceMatch = serviceFilter === "all" || p.service === serviceFilter;
    const channelMatch = channelFilter === "all" || p.channel === channelFilter;
    return providerMatch && serviceMatch && channelMatch;
  });

  const providerOptions: SelectOption[] = [
    { value: "all", label: "全部厂商" },
    ...providerList.map((p) => ({ value: p, label: p })),
  ];

  const serviceOptions: SelectOption[] = [
    { value: "all", label: "全部服务" },
    ...serviceList.map((s) => ({ value: s, label: s.toUpperCase() })),
  ];

  const channelOptions: SelectOption[] = [
    { value: "all", label: "全部通道" },
    ...channelList.map((c) => ({ value: c, label: c })),
  ];

  function calcAvailability(timeline: TimelineItem[]): number {
    if (!timeline || timeline.length === 0) return 0;
    const total = timeline.reduce((sum, t) => sum + t.availability, 0);
    return total / timeline.length;
  }

  function renderTimeline(timeline: TimelineItem[]) {
    const recent = timeline.slice(-24);
    return (
      <div className="timeline">
        {recent.map((t, i) => (
          <div
            key={i}
            className={`bar ${t.status === 1 ? "up" : "down"}`}
            title={`${t.time} - ${t.availability.toFixed(0)}%`}
          />
        ))}
      </div>
    );
  }

  // 悬浮球模式 - 放在所有 hooks 之后
  if (bubbleConfig.enabled) {
    return <BubbleView provider={bubbleProvider} onExpand={handleExpandFromBubble} size={bubbleConfig.size} />;
  }

  if (showSettings) {
    return (
      <SettingsPage
        onBack={() => setShowSettings(false)}
        allProviders={allProviders}
        bubbleConfig={bubbleConfig}
        onBubbleConfigChange={handleBubbleConfigChange}
      />
    );
  }

  if (loading) {
    return <div className="card loading">加载中...</div>;
  }

  return (
    <div className="card">
      <div className="filters">
        <CustomSelect
          options={providerOptions}
          value={providerFilter}
          onChange={handleProviderChange}
        />
        <CustomSelect
          options={serviceOptions}
          value={serviceFilter}
          onChange={handleServiceChange}
        />
        <CustomSelect
          options={channelOptions}
          value={channelFilter}
          onChange={setChannelFilter}
        />
        <button className="settings-btn" onClick={() => setShowSettings(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        {lastUpdate && <span className="last-update">{lastUpdate}</span>}
        {refreshing && <div className="refresh-indicator"></div>}
      </div>

      <div className="list">
        {filteredProviders.length === 0 ? (
          <div className="empty">无匹配数据</div>
        ) : (
          filteredProviders.map((p, index) => (
            <div key={`${p.provider}-${p.channel}-${index}`} className="row">
              <div className="status-dot" data-status={p.current_status.status} />
              <div className="info">
                <div className="name">{p.provider}</div>
                <div className="channel">{p.channel}</div>
              </div>
              <div className="service-tag">{p.service}</div>
              <div className="stats">
                <span className={`status-text ${p.current_status.status === 1 ? "up" : "down"}`}>
                  {p.current_status.status === 1 ? "可用" : "异常"}
                </span>
                <span className="availability">{calcAvailability(p.timeline).toFixed(1)}%</span>
              </div>
              <div className="latency">{p.current_status.latency}ms</div>
              {renderTimeline(p.timeline)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
