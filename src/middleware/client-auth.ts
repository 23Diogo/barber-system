import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface ClientAuthPayload {
  clientId: string
  clientAccountId: string
  barbershopId: string
  role: 'client'
}

declare global {
  namespace Express {
    interface Request {
      clientAuth?: ClientAuthPayload
    }
  }
}

export const authenticateClient = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' })
  }

  try {
    req.clientAuth = jwt.verify(
      header.split(' ')[1],
      process.env.CLIENT_JWT_SECRET!
    ) as ClientAuthPayload

    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}
