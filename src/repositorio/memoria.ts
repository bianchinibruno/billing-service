import type { Assinatura, Cliente, Fatura, Plano } from '../dominio/tipos.js';
import type { Repositorio } from './repositorio.js';

// Implementação em memória do repositório. Suficiente para os testes e para o
// dev local sem infra. A troca por Postgres é uma nova implementação da mesma
// interface — o serviço não muda.
export class RepositorioMemoria implements Repositorio {
  private planos = new Map<string, Plano>();
  private clientes = new Map<string, Cliente>();
  private assinaturas = new Map<string, Assinatura>();
  private faturas = new Map<string, Fatura>();
  private eventosProcessados = new Set<string>();

  async salvarPlano(plano: Plano): Promise<void> {
    this.planos.set(plano.id, plano);
  }
  async obterPlano(id: string): Promise<Plano | undefined> {
    return this.planos.get(id);
  }

  async salvarCliente(cliente: Cliente): Promise<void> {
    this.clientes.set(cliente.id, cliente);
  }
  async obterCliente(id: string): Promise<Cliente | undefined> {
    return this.clientes.get(id);
  }

  async salvarAssinatura(assinatura: Assinatura): Promise<void> {
    this.assinaturas.set(assinatura.id, assinatura);
  }
  async obterAssinatura(id: string): Promise<Assinatura | undefined> {
    return this.assinaturas.get(id);
  }

  async salvarFatura(fatura: Fatura): Promise<void> {
    this.faturas.set(fatura.id, fatura);
  }
  async obterFatura(id: string): Promise<Fatura | undefined> {
    return this.faturas.get(id);
  }

  async registrarEventoSeNovo(eventId: string): Promise<boolean> {
    if (this.eventosProcessados.has(eventId)) {
      return false;
    }
    this.eventosProcessados.add(eventId);
    return true;
  }
}
