export default async function handler(req, res) {
  return res.status(200).json({
    status: "ok",
    mock_mode: process.env.USE_MOCK_DATA !== "false",
    time: new Date().toISOString(),
  });
}
