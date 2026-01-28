import React, { useState } from 'react'
import { createWorker } from 'tesseract.js'

const OCR = () => {
    // const [filepath, setFilepath] = useState(null)
    const [text, setText] = useState("")

    const handleChange = async (e) => {
       const file = e.target.files?.[0]
        const worker = await createWorker("eng")
        const ret = await worker.recognize(file)
        setText(ret.data.text)
        await worker.terminate()
    }



  return (
    <>
        <input onChange={handleChange} type='file'/>
        {text && <div>{text}</div>}
    </>
  )
}

export default OCR