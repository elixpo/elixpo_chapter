'use client'


import React from 'react'

import Layout from './layout'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import ProductShowCase from './components/ProductShowCase'
import TestiMoni from './components/TestiMoni'
import Faq from './components/Faq'
import CallToAction from './components/CallToAction'
import ProjectsShowCase from './components/ProjectsShowCase'
import Try from './components/Try'
import Footer from './components/Footer'

const page = () => {
 
  
 
  return (
   <Layout>
    <Navbar/>
    <Hero/>
    <ProductShowCase/>
    <TestiMoni/>
    <Faq/>
    <CallToAction/>
    <ProjectsShowCase/>
    <Try/>
    <Footer/>
   </Layout>
   
  )
}

export default page