import { Request, Response } from 'express'
import { reportsService } from './reports.service'

export const getGrowthPanel = async (req: Request, res: Response) => {
  try {
    const data = await reportsService.getGrowthPanel(req.user!.barbershopId)
    res.json(data)
  } catch (err: any) {
    console.error('REPORTS getGrowthPanel error:', err)
    res.status(400).json({ error: err.message })
  }
}
