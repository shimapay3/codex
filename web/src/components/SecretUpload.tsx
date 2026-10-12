import { useRef } from 'react'
import { Upload } from 'lucide-react'

/**
 * Reusable file upload button for keypair / passphrase / private key forms.
 * Reads the file as text and passes the content to the parent's `onLoad` callback.
 */
export default function SecretUpload({ onLoad }: { onLoad: (text: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '').trim()
      if (text) onLoad(text)
    }
    reader.readAsText(file)
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".json,.txt,.key,application/json,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex items-center justify-center gap-1.5 rounded-2xl border border-[color:var(--border)] py-2.5 text-[12px] font-semibold transition hover:border-[color:var(--accent)]"
      >
        <Upload size={14} /> Tải file khoá
      </button>
    </>
  )
}
