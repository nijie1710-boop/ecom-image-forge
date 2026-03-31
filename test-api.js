fetch('https://api.minimax.chat/v1/image_generation', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-api-al8gVMvpqzxar9U4Gyfhp_Bw0dHRCk2WbFcLwTCVU4IyorolwtrNA3OMHy5v-nCHdxNxmbrtDpbP0g58_Wo6_kCltxMOQJeUmDscA0dawNyI0isBBNkdQgU'
  },
  body: JSON.stringify({
    model: 'image-01',
    prompt: 'a white cup on table',
    aspect_ratio: '1:1',
    n: 1,
    response_format: 'url'
  })
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
