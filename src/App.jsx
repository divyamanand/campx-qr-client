
const App = () => {
  

  const handleSelect = async (e) => {
    console.log(typeof(e.target.files))
    console.log(e.target.files.length)
    const files = Array.from(e.target.files)
    const n = files.length
    
    for (let i = 0; i < n; i+=5) {
      const fileBatch = files.slice(i, i+5)
      const promises = fileBatch.map((file) => delayPrint(file))
      await Promise.all(promises)
      console.log("Batch done")
    }
  }

  return (
    <>
      <input type='file' multiple webkitdirectory = "true" onChange={handleSelect}/>
    </>
  )
}

export default App