import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  // ---- CategoryConfig ----
  await prisma.categoryConfig.deleteMany()
  await prisma.categoryConfig.createMany({
    data: [
      { category: 'PLUMBING', icon: 'plumbing' },
      { category: 'TEACHING', icon: 'school' },
      { category: 'DELIVERY', icon: 'local_shipping' },
      { category: 'CLEANING', icon: 'cleaning_services' },
      { category: 'DESIGN', icon: 'brush' },
      { category: 'DIGITAL', icon: 'computer' },
    ],
  })

  // ---- Clean existing test data ----
  await prisma.service.deleteMany()
  await prisma.providerProfile.deleteMany()
  await prisma.user.deleteMany()

  const hash = (pw: string) => bcrypt.hash(pw, 10)

  // ---- Users ----
  const [client, pedro, maria, roberto, ana] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'client@test.com',
        passwordHash: await hash('test1234'),
        name: 'Carlos Monterrosa',
        role: 'CLIENT',
      },
    }),
    prisma.user.create({
      data: {
        email: 'pedro@test.com',
        passwordHash: await hash('test1234'),
        name: 'Pedro García',
        role: 'PROVIDER',
      },
    }),
    prisma.user.create({
      data: {
        email: 'maria@test.com',
        passwordHash: await hash('test1234'),
        name: 'María López',
        role: 'PROVIDER',
      },
    }),
    prisma.user.create({
      data: {
        email: 'roberto@test.com',
        passwordHash: await hash('test1234'),
        name: 'Roberto Hernández',
        role: 'PROVIDER',
      },
    }),
    prisma.user.create({
      data: {
        email: 'ana@test.com',
        passwordHash: await hash('test1234'),
        name: 'Ana Martínez',
        role: 'PROVIDER',
      },
    }),
  ])

  // ---- Provider profiles ----
  const [pedroProfile, mariaProfile, robertoProfile, anaProfile] = await Promise.all([
    prisma.providerProfile.create({
      data: { userId: pedro.id, bio: 'Plomero certificado con 10 años de experiencia.', category: 'PLUMBING', rating: 4.8, totalReviews: 32 },
    }),
    prisma.providerProfile.create({
      data: { userId: maria.id, bio: 'Maestra de matemáticas y ciencias para primaria y secundaria.', category: 'TEACHING', rating: 4.9, totalReviews: 58 },
    }),
    prisma.providerProfile.create({
      data: { userId: roberto.id, bio: 'Delivery express en toda el área metropolitana de San Salvador.', category: 'DELIVERY', rating: 4.6, totalReviews: 120 },
    }),
    prisma.providerProfile.create({
      data: { userId: ana.id, bio: 'Diseñadora gráfica y web con 6 años de experiencia.', category: 'DESIGN', rating: 4.7, totalReviews: 21 },
    }),
  ])

  // ---- Services ----
  await prisma.service.createMany({
    data: [
      {
        title: 'Reparación de tuberías y fugas',
        description: 'Detección y reparación de fugas, cambio de tuberías dañadas y revisión general del sistema hidráulico del hogar.',
        priceInTkiero: 120,
        category: 'PLUMBING',
        providerId: pedroProfile.id,
      },
      {
        title: 'Instalación de calentador de agua',
        description: 'Instalación y conexión de calentadores eléctricos o de gas, incluyendo revisión de presión y pruebas de seguridad.',
        priceInTkiero: 250,
        category: 'PLUMBING',
        providerId: pedroProfile.id,
      },
      {
        title: 'Clases de matemáticas — primaria y secundaria',
        description: 'Refuerzo escolar de álgebra, geometría y aritmética. Sesiones de 1 hora adaptadas al nivel del estudiante.',
        priceInTkiero: 40,
        category: 'TEACHING',
        providerId: mariaProfile.id,
      },
      {
        title: 'Preparación para bachillerato PAES',
        description: 'Preparación intensiva para el examen de bachillerato. Incluye simulacros y material de estudio actualizado.',
        priceInTkiero: 180,
        category: 'TEACHING',
        providerId: mariaProfile.id,
      },
      {
        title: 'Delivery en San Salvador y alrededores',
        description: 'Entrega de paquetes, documentos o compras del día en San Salvador, Santa Tecla y Antiguo Cuscatlán. Mismo día.',
        priceInTkiero: 15,
        category: 'DELIVERY',
        providerId: robertoProfile.id,
      },
      {
        title: 'Mensajería express — entrega en 2 horas',
        description: 'Servicio urgente de mensajería para contratos, facturas y documentos legales dentro del Área Metropolitana.',
        priceInTkiero: 35,
        category: 'DELIVERY',
        providerId: robertoProfile.id,
      },
      {
        title: 'Diseño de logo y branding',
        description: 'Creación de identidad visual completa: logotipo en vectores, paleta de colores, tipografía y guía de marca.',
        priceInTkiero: 320,
        category: 'DESIGN',
        providerId: anaProfile.id,
      },
    ],
  })

  console.log('✅  Seed completado')
  console.log(`   ${await prisma.categoryConfig.count()} categorías`)
  console.log(`   ${await prisma.user.count()} usuarios`)
  console.log(`   ${await prisma.providerProfile.count()} perfiles de proveedor`)
  console.log(`   ${await prisma.service.count()} servicios`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
