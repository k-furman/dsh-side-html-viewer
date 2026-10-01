const res = await fetch('./data.json')
const data = await res.json()
document.querySelector('#result').textContent = data.message
