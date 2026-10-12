import { useMemo } from 'react'
import { Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { Loader2, TrendingUp } from 'lucide-react'
import { BalanceSample } from '../state/vault'
import { useWallet } from '../state/WalletProvider'
import { formatAmount } from '../lib/solana'

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload as BalanceSample
  return (
    <div className="rounded-xl glass-strong px-2.5 py-1.5 text-[11px] shadow-card">
      <p className="font-semibold">{formatAmount(point.amount, 2)} USDC</p>
      <p className="text-[color:var(--muted)]">
        {new Date(point.t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  )
}

/**
 * Live balance growth. Samples are collected locally every time the wallet
 * refreshes its balance, so the curve reflects this device's real history.
 */
export default function BalanceChart({ height = 132 }: { height?: number }) {
  const { samples, balance } = useWallet()

  const data = useMemo(() => {
    const points = [...samples]
    if (!points.length || points[points.length - 1].amount !== balance.usdc) {
      points.push({ t: Date.now(), amount: balance.usdc })
    }
    if (points.length === 1) {
      points.unshift({ t: points[0].t - 60000, amount: points[0].amount })
    }
    return points.map((point) => ({
      ...point,
      time: new Date(point.t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    }))
  }, [samples, balance.usdc])

  const values = data.map((point) => point.amount)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.25, 0.5)

  const rising = values[values.length - 1] >= values[0]
  const hasData = samples.length > 0 || balance.usdc > 0

  // Demo data for new wallets — a gentle upward line so the user sees what
  // the chart will look like once real balance samples arrive.
  const demoData = useMemo(() => {
    const now = Date.now()
    const demoValues = [0, 12.5, 8.3, 24.7, 18.1, 31.2, 28.5, 42.0]
    return demoValues.map((amount, i) => ({
      t: now - (demoValues.length - 1 - i) * 60000,
      amount,
      time: new Date(now - (demoValues.length - 1 - i) * 60000).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }))
  }, [])

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
          <TrendingUp size={13} className="accent-text" /> Tăng trưởng số dư
        </span>
        <span
          className="rounded-full px-2 py-[3px] text-[10.5px] font-semibold"
          style={{
            background: rising ? 'rgba(34,224,122,.16)' : 'rgba(255,77,109,.16)',
            color: rising ? '#22e07a' : '#ff4d6d',
          }}
        >
          {hasData ? (
            <>{rising ? '▲' : '▼'} realtime</>
          ) : (
            <span style={{ background: 'rgba(255,176,32,.16)', color: '#ffb020' }}>demo</span>
          )}
        </span>
      </div>
      {balance.loading && !hasData ? (
        <div style={{ height }} className="flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-[color:var(--muted)]" />
        </div>
      ) : !hasData ? (
        <div style={{ height }} className="relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={demoData} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="demo-stroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--accent-2)" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, 'auto']} />
              <Tooltip
                content={({ active: a, payload }) => {
                  if (!a || !payload?.length) return null
                  const p = payload[0].payload as any
                  return (
                    <div className="rounded-xl glass-strong px-2.5 py-1.5 text-[11px] shadow-card">
                      <p className="font-semibold">{formatAmount(p.amount, 2)} USDC</p>
                      <p className="text-[color:var(--muted)]">{p.time}</p>
                    </div>
                  )
                }}
                cursor={{ stroke: 'var(--border)' }}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="url(#demo-stroke)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="absolute bottom-1 left-0 right-0 text-center text-[10px] text-[color:var(--muted)] opacity-60">
            Biểu đồ mẫu — dữ liệu thực sẽ hiển thị khi ví nhận USDC
          </p>
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="balance-stroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="100%" stopColor="var(--accent-2)" />
                </linearGradient>
              </defs>
              <YAxis hide domain={[Math.max(0, min - padding), max + padding]} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)' }} />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="url(#balance-stroke)"
                strokeWidth={2.4}
                fill="url(#balance-fill)"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--accent-2)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
